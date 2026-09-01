import numpy as np
from app.perception.tracker import Tracker
from app.perception.projection import ProjectionMap
from app.engine.decision_engine import DecisionEngine

def main():
    print("Testing internal modules...")
    
    # Test Tracker
    tracker = Tracker()
    mock_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    tracked_objects = tracker.process_frame(mock_frame)
    print(f"Tracked Objects: {tracked_objects}")
    
    # Test ProjectionMap
    proj_map = ProjectionMap()
    objects_3d = []
    for obj in tracked_objects:
        pos_3d = proj_map.project_to_3d(obj['bbox'])
        objects_3d.append({**obj, **pos_3d})
    print(f"3D Objects: {objects_3d}")
    
    # Test DecisionEngine
    engine = DecisionEngine()
    action, reasoning = engine.evaluate_maneuvers(objects_3d)
    print(f"Action: {action}")
    print(f"Reasoning: {reasoning}")
    
    print("All internal modules ran successfully!")

if __name__ == "__main__":
    main()
