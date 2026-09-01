"""
Unit & Integration Tests for AURA-AV Sensor Confidence Evolution Module
"""

import time
import pytest
from app.engine.sensor_confidence import SensorConfidenceTracker
from app.engine.decision_engine import DecisionEngine


def test_baseline_initialization():
    """Verify default baseline values and modalities."""
    tracker = SensorConfidenceTracker()
    assert "camera" in tracker.smoothed_confidence
    assert "lidar" in tracker.smoothed_confidence
    assert "radar" in tracker.smoothed_confidence
    assert "imu" in tracker.smoothed_confidence
    assert "gnss" in tracker.smoothed_confidence
    
    assert tracker.smoothed_confidence["camera"] == 0.98
    assert tracker.smoothed_confidence["radar"] == 0.98
    assert tracker.reasons["camera"] == "NOMINAL_CLEAR"
    assert tracker.health["camera"] == "ONLINE"


def test_ema_smoothing_continuity():
    """Verify Exponential Moving Average prevents abrupt step jumps."""
    tracker = SensorConfidenceTracker(ema_alpha=0.20)
    initial_cam = tracker.smoothed_confidence["camera"]
    
    # Step input: suddenly introduce severe fog
    active_faults = {"weather_degradation": {"time": time.time(), "duration": 10}}
    res1 = tracker.update(active_faults=active_faults, timestamp=100.0)
    
    # Step 1: smoothed value should move towards 0.38 but NOT jump directly to 0.38
    cam_step1 = res1["current"]["camera"]["confidence"]
    assert cam_step1 < initial_cam
    assert cam_step1 > 0.45, f"Expected gradual EMA drop, got {cam_step1}"
    assert res1["current"]["camera"]["trend"] == "FALLING"
    assert res1["current"]["camera"]["reason"] == "SEVERE_FOG"
    assert res1["current"]["camera"]["health"] == "DEGRADED"

    # Multiple ticks should smoothly converge
    for t in range(1, 20):
        res = tracker.update(active_faults=active_faults, timestamp=100.0 + t * 0.05)
    
    converged_cam = res["current"]["camera"]["confidence"]
    assert abs(converged_cam - 0.38) < 0.03, f"Expected convergence to ~0.38, got {converged_cam}"


def test_fog_degradation_and_radar_resilience():
    """Verify CAM degrades during fog while RADAR remains stable above 0.90."""
    tracker = SensorConfidenceTracker()
    active_faults = {"weather_degradation": {"time": time.time(), "duration": 10}}
    
    # Run 15 ticks in fog
    for t in range(15):
        res = tracker.update(active_faults=active_faults, timestamp=100.0 + t * 0.05)

    cam_conf = res["current"]["camera"]["confidence"]
    lidar_conf = res["current"]["lidar"]["confidence"]
    radar_conf = res["current"]["radar"]["confidence"]

    assert cam_conf < 0.55, f"Camera should be degraded, got {cam_conf}"
    assert lidar_conf < 0.75, f"LiDAR should be partially degraded, got {lidar_conf}"
    assert radar_conf >= 0.94, f"RADAR must remain high resilience, got {radar_conf}"
    
    # Check arbitration recommendation
    arbitration = res["arbitration"]
    assert arbitration["dominant_sensor"] == "RADAR"
    assert arbitration["is_degraded_arbitration"] is True
    assert "RADAR arbitrated over CAM/LiDAR" in arbitration["override_reason"]


def test_dropout_recovery_curve():
    """Verify sensors smoothly recover back to nominal baseline after fault is cleared."""
    tracker = SensorConfidenceTracker()
    
    # 1. Fault active
    active_faults = {"camera_glare": {"time": time.time(), "duration": 5}}
    for t in range(15):
        tracker.update(active_faults=active_faults, timestamp=100.0 + t * 0.05)
    
    degraded_val = tracker.smoothed_confidence["camera"]
    assert degraded_val < 0.50

    # 2. Clear fault
    for t in range(25):
        res = tracker.update(active_faults={}, timestamp=101.0 + t * 0.05)
    
    recovered_val = res["current"]["camera"]["confidence"]
    assert recovered_val > degraded_val
    assert recovered_val > 0.90, f"Expected recovery towards baseline, got {recovered_val}"
    assert res["current"]["camera"]["reason"] == "NOMINAL_CLEAR"


def test_history_buffer_rolling_bounds():
    """Verify rolling history maintains 15-second capacity window without memory leaks."""
    tracker = SensorConfidenceTracker(history_duration_sec=15.0, update_frequency_hz=20.0)
    
    # Simulate 500 ticks (~25 seconds of data)
    for t in range(500):
        res = tracker.update(active_faults={}, timestamp=1000.0 + t * 0.05)
    
    assert len(res["history"]) <= tracker.max_history_len
    assert len(res["history"]) >= 300
    
    # Verify timestamps are strictly increasing
    timestamps = [pt["timestamp"] for pt in res["history"]]
    assert timestamps == sorted(timestamps)


def test_event_markers_generation():
    """Verify transition event markers are registered on fault changes."""
    tracker = SensorConfidenceTracker()
    
    # Start blindspot fault
    res1 = tracker.update(active_faults={"sensor_blindspot": {"time": time.time(), "duration": 8}}, timestamp=100.0)
    assert len(res1["events"]) >= 1
    assert "SENSOR BLINDSPOT STARTED" in res1["events"][-1]["event"]
    
    # Resolve blindspot fault
    res2 = tracker.update(active_faults={}, timestamp=108.0)
    assert len(res2["events"]) >= 2
    assert "SENSOR BLINDSPOT RESOLVED" in res2["events"][-1]["event"]


def test_decision_engine_arbitration_integration():
    """Verify DecisionEngine utilizes sensor confidence and logs arbitration reasoning."""
    engine = DecisionEngine()
    tracker = SensorConfidenceTracker()
    
    # Degrade camera with fog
    active_faults = {"weather_degradation": {"time": time.time(), "duration": 10}}
    for t in range(15):
        conf_data = tracker.update(active_faults=active_faults, timestamp=100.0 + t * 0.05)
    
    mock_objects = [{"id": 101, "class": "car", "x": 0.0, "y": 0.0, "z": 15.0, "relative_velocity": 10.0}]
    result = engine.evaluate_hazard_event_ml(mock_objects, ego_speed=60.0, sensor_confidence=conf_data)
    
    assert "arbitration" in result
    assert result["arbitration"]["dominant_sensor"] == "RADAR"
    
    # Check that arbitration causal chain appears in hypotheses reasoning
    reasoning_text = str(result["hypotheses_reasoning"])
    assert "Sensor Arbitration" in reasoning_text or "RADAR" in reasoning_text
