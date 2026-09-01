import json
import os
import glob
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import joblib

def extract_features(event, ego_speed):
    """
    Extracts numerical features from a hazard event for the ML model.
    """
    min_ttc = 99.9
    closest_z = 100.0
    max_rel_vel = 0.0
    has_converging = 0.0
    
    objects = event.get("tracked_objects", [])
    for obj in objects:
        z_dist = obj.get("z", 50.0)
        rel_vel = obj.get("relative_velocity", 0.0)
        is_conv = obj.get("is_converging", False)
        
        ttc = (z_dist / rel_vel) if rel_vel > 0.05 else 99.9
        if ttc < min_ttc:
            min_ttc = ttc
        
        if z_dist < closest_z:
            closest_z = z_dist
            
        if rel_vel > max_rel_vel:
            max_rel_vel = rel_vel
            
        if is_conv:
            has_converging = 1.0
            
    return [ego_speed, min_ttc, closest_z, max_rel_vel, has_converging]

def load_data(datasets_dir):
    X = []
    y_risk = []
    y_action = []
    
    for filepath in glob.glob(os.path.join(datasets_dir, "dataset_*.json")):
        with open(filepath, 'r') as f:
            data = json.load(f)
            
        risk = data.get("risk_category", "LOW")
        action = data.get("expected_action", "Maintain Course")
        
        for event in data.get("events", []):
            ego_speed = event.get("ego_speed_kmh", 50.0)
            features = extract_features(event, ego_speed)
            
            # Since these JSON files describe a scenario where ALL events map to the overall risk/action, 
            # we will label all events with the scenario's expected risk/action for simplicity.
            # In a real pipeline, each frame might have its own label.
            X.append(features)
            y_risk.append(risk)
            y_action.append(action)
            
    return X, y_risk, y_action

def train():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    datasets_dir = os.path.join(base_dir, "datasets")
    models_dir = os.path.join(base_dir, "models")
    
    if not os.path.exists(models_dir):
        os.makedirs(models_dir)
        
    X, y_risk, y_action = load_data(datasets_dir)
    
    print(f"Loaded {len(X)} samples.")
    
    if len(X) == 0:
        print("No training data found!")
        return
        
    # We will train two classifiers: one for Risk and one for Action, or just use one for Action and derive Risk.
    # Let's train a model predicting Action, and another for Risk.
    
    clf_risk = RandomForestClassifier(n_estimators=50, random_state=42)
    clf_risk.fit(X, y_risk)
    
    clf_action = RandomForestClassifier(n_estimators=50, random_state=42)
    clf_action.fit(X, y_action)
    
    print("Risk Classification Report:")
    print(classification_report(y_risk, clf_risk.predict(X)))
    
    # Save models
    risk_model_path = os.path.join(models_dir, "risk_model.pkl")
    action_model_path = os.path.join(models_dir, "action_model.pkl")
    
    joblib.dump(clf_risk, risk_model_path)
    joblib.dump(clf_action, action_model_path)
    print(f"Models saved to {models_dir}")

if __name__ == "__main__":
    train()
