"""
AURA-AV Sensor Confidence Evolution Module
Independent, temporal sensor confidence tracking and arbitration for:
CAM, LIDAR, RADAR, IMU, and GNSS.

Calculation Formula:
  Confidence = Baseline * Environment Factor * Data Quality Factor (clamped [0.0, 1.0])

Features:
  - Exponential Moving Average (EMA) smoothing for continuous transitions.
  - 15-second rolling history buffer (~300 samples at 20 Hz).
  - State tracking with explicit degradation reason tags.
  - Separate semantics for "Confidence" (fidelity) vs "Health" (hardware connectivity).
  - Event marker generation on significant confidence state changes.
"""

import time
import math
from collections import deque
from typing import Dict, List, Any, Optional, Tuple


class SensorConfidenceTracker:
    # Sensor identifiers
    SENSORS = ["camera", "lidar", "radar", "imu", "gnss"]

    # Baseline sensor confidence under nominal conditions
    DEFAULT_BASELINES = {
        "camera": 0.98,
        "lidar": 0.96,
        "radar": 0.98,
        "imu": 0.99,
        "gnss": 0.95,
    }

    def __init__(
        self,
        ema_alpha: float = 0.20,
        history_duration_sec: float = 15.0,
        update_frequency_hz: float = 20.0
    ):
        self.ema_alpha = ema_alpha
        self.history_duration_sec = history_duration_sec
        self.max_history_len = int(history_duration_sec * update_frequency_hz) + 50 # Buffer margin (~350 samples)
        
        # Smoothed confidence state (0.0 to 1.0)
        self.smoothed_confidence: Dict[str, float] = dict(self.DEFAULT_BASELINES)
        self.previous_confidence: Dict[str, float] = dict(self.DEFAULT_BASELINES)
        
        # Reason and health state tracking
        self.reasons: Dict[str, str] = {s: "NOMINAL_CLEAR" for s in self.SENSORS}
        self.health: Dict[str, str] = {s: "ONLINE" for s in self.SENSORS}
        
        # 15-second rolling history deque: stores dicts of {timestamp, time_offset, camera, lidar, radar, imu, gnss}
        self.history_buffer: deque = deque(maxlen=self.max_history_len)
        
        # Event markers list (most recent 20 events)
        self.event_markers: deque = deque(maxlen=20)
        self.event_counter: int = 0
        
        # State change hysteresis tracker
        self._last_active_fault_keys: set = set()
        self._start_time: float = time.time()

    def _compute_factors(
        self,
        sensor: str,
        active_faults: Dict[str, Any],
        ego_dynamics: Optional[Dict[str, float]] = None
    ) -> Tuple[float, float, str, str]:
        """
        Computes (environment_factor, quality_factor, reason_str, health_status)
        for a given sensor based on active environmental conditions and faults.
        """
        env_factor = 1.0
        quality_factor = 1.0
        reason = "NOMINAL_CLEAR"
        health = "ONLINE"
        
        # 1. Weather / Fog / Rain conditions
        has_weather = "weather_degradation" in active_faults or "fog" in active_faults
        if has_weather:
            if sensor == "camera":
                env_factor = 0.38
                reason = "SEVERE_FOG"
                health = "DEGRADED"
            elif sensor == "lidar":
                env_factor = 0.65
                quality_factor = 0.95
                reason = "BACKSCATTER_NOISE"
                health = "DEGRADED"
            elif sensor == "radar":
                env_factor = 1.0
                reason = "PENETRATES_FOG"
                health = "ONLINE"
            elif sensor == "gnss":
                env_factor = 0.90
                reason = "ATMOSPHERIC_ATTENUATION"
                health = "ONLINE"
            elif sensor == "imu":
                env_factor = 1.0
                reason = "UNAFFECTED"
                health = "ONLINE"

        # 2. Camera Glare
        if "camera_glare" in active_faults:
            if sensor == "camera":
                env_factor = min(env_factor, 0.28)
                quality_factor = 0.85
                reason = "DIRECT_SUN_GLARE"
                health = "DEGRADED"

        # 3. Sensor Blindspot / Occlusion
        if "sensor_blindspot" in active_faults:
            if sensor == "camera":
                env_factor = min(env_factor, 0.32)
                reason = "SECTOR_OCCLUSION"
                health = "DEGRADED"
            elif sensor == "lidar":
                env_factor = min(env_factor, 0.40)
                reason = "SECTOR_OCCLUSION"
                health = "DEGRADED"

        # 4. Hard LiDAR Hardware / Emitter Failure
        if "lidar_failure" in active_faults:
            if sensor == "lidar":
                env_factor = 0.05
                quality_factor = 0.10
                reason = "LASER_EMITTER_TIMEOUT"
                health = "FAULT"

        # 5. GNSS Dropout / Multipath
        if "gnss_dropout" in active_faults:
            if sensor == "gnss":
                env_factor = 0.12
                quality_factor = 0.40
                reason = "MULTIPATH_SATELLITE_LOCK_LOST"
                health = "DEGRADED"

        # 6. Dynamic Motion / Vibration Quality check for IMU
        if ego_dynamics:
            accel_g = abs(ego_dynamics.get("acceleration_g", 0.0))
            lat_g = abs(ego_dynamics.get("lateral_g", 0.0))
            if accel_g > 0.8 or lat_g > 0.5:
                if sensor == "imu":
                    quality_factor = 0.90
                    reason = "HIGH_DYNAMICS_VIBRATION"

        return env_factor, quality_factor, reason, health

    def update(
        self,
        active_faults: Optional[Dict[str, Any]] = None,
        ego_dynamics: Optional[Dict[str, float]] = None,
        timestamp: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Updates the confidence tracker for one cycle (typically 20 Hz).
        Applies EMA smoothing, registers event markers, and appends to rolling history.
        """
        if active_faults is None:
            active_faults = {}
        if timestamp is None:
            timestamp = time.time()

        # Check for fault transitions to trigger event markers
        current_fault_keys = set(active_faults.keys())
        newly_started = current_fault_keys - self._last_active_fault_keys
        newly_cleared = self._last_active_fault_keys - current_fault_keys

        for fault in newly_started:
            self._register_event(
                timestamp=timestamp,
                event_type=f"{fault.upper().replace('_', ' ')} STARTED",
                reason=f"Environmental/fault condition '{fault}' activated",
                severity="WARNING" if "failure" in fault or "override" in fault else "CAUTION"
            )

        for fault in newly_cleared:
            self._register_event(
                timestamp=timestamp,
                event_type=f"{fault.upper().replace('_', ' ')} RESOLVED",
                reason=f"Condition '{fault}' ended, recovering confidence",
                severity="INFO"
            )

        self._last_active_fault_keys = current_fault_keys

        # Compute raw confidence and smooth with EMA
        raw_confidence: Dict[str, float] = {}
        trends: Dict[str, str] = {}
        
        for sensor in self.SENSORS:
            baseline = self.DEFAULT_BASELINES.get(sensor, 0.95)
            env_factor, quality_factor, reason, health = self._compute_factors(
                sensor, active_faults, ego_dynamics
            )
            
            raw = max(0.0, min(1.0, baseline * env_factor * quality_factor))
            raw_confidence[sensor] = raw
            self.reasons[sensor] = reason
            self.health[sensor] = health

            # Apply Exponential Moving Average (EMA)
            prev = self.smoothed_confidence[sensor]
            smoothed = (self.ema_alpha * raw) + ((1.0 - self.ema_alpha) * prev)
            smoothed = max(0.0, min(1.0, smoothed))
            
            # Trend determination
            delta = smoothed - prev
            if delta > 0.005:
                trend = "RISING"
            elif delta < -0.005:
                trend = "FALLING"
            else:
                trend = "STABLE"

            self.previous_confidence[sensor] = prev
            self.smoothed_confidence[sensor] = smoothed
            trends[sensor] = trend

        # Append to 15-second rolling history buffer
        history_point = {
            "timestamp": int(timestamp * 1000),
            "camera": round(self.smoothed_confidence["camera"], 3),
            "lidar": round(self.smoothed_confidence["lidar"], 3),
            "radar": round(self.smoothed_confidence["radar"], 3),
            "imu": round(self.smoothed_confidence["imu"], 3),
            "gnss": round(self.smoothed_confidence["gnss"], 3),
        }
        self.history_buffer.append(history_point)

        # Build current status mapping
        current_map = {}
        for sensor in self.SENSORS:
            current_map[sensor] = {
                "confidence": round(self.smoothed_confidence[sensor], 3),
                "confidencePct": round(self.smoothed_confidence[sensor] * 100.0, 1),
                "trend": trends[sensor],
                "reason": self.reasons[sensor],
                "health": self.health[sensor],
            }

        # Check arbitration recommendation
        arbitration = self.get_arbitration_recommendation()

        return {
            "current": current_map,
            "history": list(self.history_buffer),
            "events": list(self.event_markers),
            "arbitration": arbitration
        }

    def _register_event(self, timestamp: float, event_type: str, reason: str, severity: str):
        self.event_counter += 1
        time_str = time.strftime("%H:%M:%S", time.localtime(timestamp)) + f".{int(timestamp * 10) % 10}"
        self.event_markers.append({
            "id": f"evt-{self.event_counter}",
            "timestamp": int(timestamp * 1000),
            "timeLabel": time_str,
            "event": event_type,
            "reason": reason,
            "severity": severity,
        })

    def get_arbitration_recommendation(self) -> Dict[str, Any]:
        """
        Evaluates current sensor confidences to provide arbitration weights
        and determine if an explicit cross-sensor override (e.g. RADAR > CAM) is active.
        """
        cam_conf = self.smoothed_confidence["camera"]
        lidar_conf = self.smoothed_confidence["lidar"]
        radar_conf = self.smoothed_confidence["radar"]
        
        # Relative weights for perception fusion
        total_perception = cam_conf + lidar_conf + radar_conf
        if total_perception > 0:
            weights = {
                "camera": round(cam_conf / total_perception, 3),
                "lidar": round(lidar_conf / total_perception, 3),
                "radar": round(radar_conf / total_perception, 3),
            }
        else:
            weights = {"camera": 0.33, "lidar": 0.33, "radar": 0.34}

        # Check for active arbitration override
        is_radar_preferred = (cam_conf < 0.60 or lidar_conf < 0.60) and radar_conf > 0.85
        
        if is_radar_preferred:
            dominant_sensor = "RADAR"
            override_reason = (
                f"RADAR arbitrated over CAM/LiDAR (RADAR: {radar_conf*100:.0f}%, "
                f"CAM: {cam_conf*100:.0f}% [{self.reasons['camera']}])"
            )
        elif cam_conf >= 0.85 and lidar_conf >= 0.85:
            dominant_sensor = "FUSED_NOMINAL"
            override_reason = "Nominal multi-sensor optical/RF consensus"
        else:
            dominant_sensor = "LIDAR" if lidar_conf > cam_conf else "CAMERA"
            override_reason = f"Primary reliance on {dominant_sensor}"

        return {
            "dominant_sensor": dominant_sensor,
            "is_degraded_arbitration": is_radar_preferred,
            "weights": weights,
            "override_reason": override_reason
        }
