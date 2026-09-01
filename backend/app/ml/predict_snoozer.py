"""
Inference & Prediction Utility for Snoozers ML Models
Demonstrates input processing and expected outputs for new/test samples.
"""

import os
import joblib
import pandas as pd


def load_models(models_dir: str):
    clf = joblib.load(os.path.join(models_dir, "snoozer_classifier.pkl"))
    reg_event = joblib.load(os.path.join(models_dir, "event_time_regressor.pkl"))
    reg_lead = joblib.load(os.path.join(models_dir, "lead_time_regressor.pkl"))
    return clf, reg_event, reg_lead


def predict_sample(sample_id: str, time_of_alert: float = None):
    """
    Given an ID and an optional alert time:
    Returns the predicted Target (0 or 1), Event Probability, Predicted Event Time, and Expected Lead Warning Time.
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    models_dir = os.path.join(base_dir, "models")
    clf, reg_event, reg_lead = load_models(models_dir)

    # Feature extraction
    id_num = int(sample_id) if str(sample_id).isdigit() else 0
    has_alert = 1 if time_of_alert is not None else 0
    time_of_alert_filled = time_of_alert if time_of_alert is not None else 0.0

    # 1. Classification
    X_clf = pd.DataFrame([{
        "id_num": id_num,
        "has_alert": has_alert,
        "time_of_alert_filled": time_of_alert_filled
    }])

    predicted_target = int(clf.predict(X_clf)[0])
    probabilities = clf.predict_proba(X_clf)[0]
    prob_target_1 = float(probabilities[1]) if len(probabilities) > 1 else float(predicted_target)

    # 2. Timing Regression (if alert present)
    predicted_event_time = None
    predicted_lead_time = None

    if has_alert:
        X_reg = pd.DataFrame([{
            "id_num": id_num,
            "time_of_alert": time_of_alert
        }])
        predicted_event_time = float(reg_event.predict(X_reg)[0])
        predicted_lead_time = float(reg_lead.predict(X_reg)[0])

    return {
        "input": {
            "id": sample_id,
            "time_of_alert": time_of_alert
        },
        "expected_output": {
            "target": predicted_target,
            "classification_label": "CRITICAL HAZARD / EVENT TRIGGERED (1)" if predicted_target == 1 else "NOMINAL / NO HAZARD (0)",
            "event_probability": f"{prob_target_1 * 100:.1f}%",
            "predicted_time_of_event": f"{predicted_event_time:.3f} s" if predicted_event_time is not None else "N/A (No Event)",
            "predicted_lead_warning_time": f"{predicted_lead_time:.3f} s" if predicted_lead_time is not None else "N/A"
        }
    }


if __name__ == "__main__":
    print("=========================================================")
    print("        SNOOZERS ML INFERENCE & EXPECTED OUTPUTS         ")
    print("=========================================================\n")

    # Test Case 1: Nominal condition (no alert)
    res1 = predict_sample(sample_id="01924", time_of_alert=None)
    print("TEST CASE 1 (Nominal / No Alert):")
    print(f"  Input       : ID={res1['input']['id']}, Alert Time={res1['input']['time_of_alert']}")
    print(f"  Output Label: {res1['expected_output']['classification_label']}")
    print(f"  Target Code : {res1['expected_output']['target']}")
    print(f"  Probability : {res1['expected_output']['event_probability']}")
    print(f"  Event Time  : {res1['expected_output']['predicted_time_of_event']}\n")

    # Test Case 2: Alert triggered at 18.633s
    res2 = predict_sample(sample_id="00822", time_of_alert=18.633)
    print("TEST CASE 2 (Alert Triggered at 18.633s):")
    print(f"  Input       : ID={res2['input']['id']}, Alert Time={res2['input']['time_of_alert']}")
    print(f"  Output Label: {res2['expected_output']['classification_label']}")
    print(f"  Target Code : {res2['expected_output']['target']}")
    print(f"  Probability : {res2['expected_output']['event_probability']}")
    print(f"  Predicted Event Time : {res2['expected_output']['predicted_time_of_event']}")
    print(f"  Predicted Lead Time  : {res2['expected_output']['predicted_lead_warning_time']}\n")

    # Test Case 3: Fast Reaction (Alert at 6.833s)
    res3 = predict_sample(sample_id="00171", time_of_alert=6.833)
    print("TEST CASE 3 (Early Alert at 6.833s):")
    print(f"  Input       : ID={res3['input']['id']}, Alert Time={res3['input']['time_of_alert']}")
    print(f"  Output Label: {res3['expected_output']['classification_label']}")
    print(f"  Target Code : {res3['expected_output']['target']}")
    print(f"  Predicted Event Time : {res3['expected_output']['predicted_time_of_event']}")
    print(f"  Predicted Lead Time  : {res3['expected_output']['predicted_lead_warning_time']}")
    print("=========================================================")
