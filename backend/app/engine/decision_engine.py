import json
import csv
import os
from typing import List, Dict, Any, Tuple

import time
import joblib

class GuidanceModule:
    """
    Guidance Module — Hazard Event to Justified Action
    Evaluates real-time hazard events and assigns justified actions:
      - LOW: Maintain Course
      - MEDIUM: Slow & Prepare to Yield
      - HIGH: Brake / Reroute Now
    """
    def __init__(self, ttc_critical_threshold: float = 2.5, ttc_caution_threshold: float = 4.5):
        self.ttc_critical = ttc_critical_threshold # seconds
        self.ttc_caution = ttc_caution_threshold   # seconds
        self.safe_lateral_lane_width = 1.8         # meters
        
        self.ml_mode = True
        try:
            models_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "models")
            self.risk_model = joblib.load(os.path.join(models_dir, "risk_model.pkl"))
            self.action_model = joblib.load(os.path.join(models_dir, "action_model.pkl"))
        except Exception as e:
            self.ml_mode = False
            print("ML models not found, falling back to heuristics:", e)

    def calculate_ttc(self, distance_z: float, relative_velocity: float) -> float:
        """Calculates Time-To-Collision in seconds."""
        if relative_velocity <= 0.05:
            return float('inf') # Object moving away or matching speed
        return distance_z / relative_velocity
        
    def _extract_features(self, objects_3d: List[Dict[str, Any]], ego_speed: float) -> List[float]:
        min_ttc = 99.9
        closest_z = 100.0
        max_rel_vel = 0.0
        has_converging = 0.0
        
        for obj in objects_3d:
            z_dist = obj.get("z", 50.0)
            rel_vel = obj.get("relative_velocity", obj.get("rel_velocity", 0.0))
            is_conv = obj.get("is_converging", False)
            
            ttc = (z_dist / rel_vel) if rel_vel > 0.05 else 99.9
            if ttc < min_ttc:
                min_ttc = ttc
            
            if z_dist < closest_z:
                closest_z = z_dist
                
            if rel_vel > max_rel_vel:
                max_rel_vel = rel_vel
                
            if is_conv or (abs(obj.get("x", 0)) < 3.2 and rel_vel > 4.0):
                has_converging = 1.0
                
        return [ego_speed, min_ttc, closest_z, max_rel_vel, has_converging]

    def evaluate_hazard_event_ml(self, objects_3d: List[Dict[str, Any]], ego_speed: float = 60.0) -> Dict[str, Any]:
        """
        Evaluates hazard events using the trained ML model.
        Returns the risk level, action, and metrics including inference latency.
        """
        start_time = time.time()
        
        if not objects_3d:
            latency = (time.time() - start_time) * 1000.0
            return {
                "risk_level": "LOW",
                "action": "Maintain Course",
                "justification": "No path conflict predicted (ML).",
                "min_ttc": float('inf'),
                "primary_hazard": None,
                "hypotheses_reasoning": {"Maintain Course": "ACCEPTED: Path is clear."},
                "target_speed_kmh": ego_speed,
                "latency_ms": latency
            }
            
        if self.ml_mode:
            features = self._extract_features(objects_3d, ego_speed)
            risk_level = str(self.risk_model.predict([features])[0])
            action = str(self.action_model.predict([features])[0])
        else:
            # Fallback
            result = self.evaluate_hazard_event(objects_3d, ego_speed)
            risk_level = result["risk_level"]
            action = result["action"]
            
        # Determine primary hazard and TTC for context
        min_ttc = float('inf')
        primary_hazard = None
        for obj in objects_3d:
            rel_vel = obj.get("relative_velocity", obj.get("rel_velocity", 8.0))
            ttc = self.calculate_ttc(obj.get("z", 50.0), rel_vel)
            if ttc < min_ttc:
                min_ttc = ttc
                primary_hazard = obj

        if action == "Maintain Course":
            target_speed = ego_speed
        elif action == "Slow & Prepare to Yield":
            target_speed = max(25.0, ego_speed * 0.6)
        else:
            target_speed = 0.0

        latency = (time.time() - start_time) * 1000.0
        return {
            "risk_level": risk_level,
            "action": action,
            "justification": f"ML Predicted Risk: {risk_level}, Action: {action}",
            "min_ttc": round(min_ttc, 2) if min_ttc != float('inf') else 99.9,
            "primary_hazard": primary_hazard,
            "hypotheses_reasoning": {action: f"ACCEPTED via ML Model (Latency: {latency:.2f}ms)"},
            "target_speed_kmh": round(target_speed, 1),
            "latency_ms": latency
        }

    def evaluate_hazard_event(self, objects_3d: List[Dict[str, Any]], ego_speed: float = 60.0) -> Dict[str, Any]:
        """Heuristic fallback method"""
        if not objects_3d:
            return {
                "risk_level": "LOW",
                "action": "Maintain Course",
                "justification": "No path conflict predicted.",
                "min_ttc": float('inf'),
                "primary_hazard": None,
                "hypotheses_reasoning": {"Maintain Course": "ACCEPTED: Path is clear."},
                "target_speed_kmh": ego_speed
            }

        min_ttc = float('inf')
        primary_hazard = None
        has_path_conflict = False

        for obj in objects_3d:
            x_lat = obj.get("x", 0.0)
            z_dist = obj.get("z", 50.0)
            rel_vel = obj.get("relative_velocity", obj.get("rel_velocity", 8.0))
            
            in_ego_path = abs(x_lat) <= self.safe_lateral_lane_width
            converging = obj.get("is_converging", False) or (abs(x_lat) < 3.2 and rel_vel > 4.0)
            ttc = self.calculate_ttc(z_dist, rel_vel)

            if (in_ego_path or converging) and ttc < min_ttc:
                min_ttc = ttc
                primary_hazard = obj
                has_path_conflict = True

        if not has_path_conflict or min_ttc >= self.ttc_caution:
            risk_level = "LOW"
            action = "Maintain Course"
            justification = "No conflict."
            target_speed = ego_speed
            reasoning = {"Maintain Course": "ACCEPTED"}
        elif self.ttc_critical <= min_ttc < self.ttc_caution:
            risk_level = "MEDIUM"
            action = "Slow & Prepare to Yield"
            justification = "Caution window."
            target_speed = max(25.0, ego_speed * 0.6)
            reasoning = {"Slow & Prepare to Yield": "ACCEPTED"}
        else:
            risk_level = "HIGH"
            action = "Brake / Reroute Now"
            justification = "Below safety threshold."
            target_speed = 0.0
            reasoning = {"Brake / Reroute Now": "ACCEPTED"}

        return {
            "risk_level": risk_level,
            "action": action,
            "justification": justification,
            "min_ttc": round(min_ttc, 2) if min_ttc != float('inf') else 99.9,
            "primary_hazard": primary_hazard,
            "hypotheses_reasoning": reasoning,
            "target_speed_kmh": round(target_speed, 1)
        }

# Alias for backwards compatibility
DecisionEngine = GuidanceModule

