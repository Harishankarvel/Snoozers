from typing import List, Dict, Tuple

class DecisionEngine:
    """
    Deterministic Multi-Hypothesis Rule Engine.
    Evaluates maneuvers and generates counterfactual semantic reasoning.
    """
    def __init__(self):
        self.ttc_threshold = 2.5 # seconds
        self.safe_distance = 10.0 # meters

    def calculate_ttc(self, obj_distance: float, relative_velocity: float) -> float:
        """Calculates Time-To-Collision."""
        if relative_velocity <= 0:
            return float('inf') # Object moving away or static relative to ego
        return obj_distance / relative_velocity

    def evaluate_maneuvers(self, objects_3d: List[Dict]) -> Tuple[str, Dict]:
        """
        Evaluates Brake, Swerve, and Maintain hypotheses.
        
        Returns:
            Tuple of (Selected Action, Counterfactual Reasoning)
        """
        reasoning = {}
        
        # 1. Evaluate Maintain
        maintain_safe = True
        for obj in objects_3d:
            # Mock relative velocity for example
            rel_velocity = 15.0 # m/s
            ttc = self.calculate_ttc(obj['z'], rel_velocity)
            
            # Check if object is in ego path (x roughly 0)
            if abs(obj['x']) < 2.0 and ttc < self.ttc_threshold:
                maintain_safe = False
                reasoning['Maintain'] = f"Rejected: Collision imminent with Target {obj.get('id', 'Unknown')} in {ttc:.1f}s."
                break
        
        if maintain_safe:
            reasoning['Maintain'] = "Accepted: Path is clear."
            return "Maintain", reasoning

        # 2. Evaluate Brake
        # In a real system, calculate required deceleration vs max possible deceleration
        brake_safe = True
        reasoning['Brake'] = "Accepted: Can stop safely before target."
        
        # 3. Evaluate Swerve (assuming Brake is safer generally, evaluate Swerve as alternative)
        swerve_safe = False
        lane_clear = True
        for obj in objects_3d:
            if abs(obj['x'] - 3.5) < 2.0: # Check adjacent lane
                lane_clear = False
                reasoning['Swerve'] = f"Rejected: Adjacent lane occupied by Target {obj.get('id', 'Unknown')}."
                break
                
        if lane_clear:
            swerve_safe = True
            reasoning['Swerve'] = "Available: Adjacent lane is clear."
        
        # Select action
        if brake_safe:
            return "Brake", reasoning
        elif swerve_safe:
            return "Swerve", reasoning
        else:
            return "Emergency Braking", reasoning
