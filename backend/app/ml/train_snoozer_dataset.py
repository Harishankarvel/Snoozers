"""
Snoozer & Alert Event Machine Learning Pipeline
Trains classification and regression models on the driver drowsiness / hazard alert dataset.
"""

import os
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedKFold, train_test_split, cross_val_score
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, RandomForestRegressor, GradientBoostingRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
    classification_report,
    mean_squared_error,
    mean_absolute_error,
    r2_score
)
from sklearn.preprocessing import StandardScaler


def load_dataset(csv_path: str) -> pd.DataFrame:
    """Loads and inspects the raw dataset."""
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Dataset not found at {csv_path}")
    df = pd.read_csv(csv_path)
    return df


def engineer_features(df: pd.DataFrame):
    """
    Feature engineering for the Snoozer event dataset:
    - id_num: integer trial/subject ID
    - has_alert: binary flag whether alert timestamp is recorded
    - has_event: binary flag whether event timestamp is recorded
    - time_of_alert_clean: imputed alert timestamp
    - time_of_event_clean: imputed event timestamp
    - alert_lead_time: difference between event and alert (lead warning margin)
    - alert_lead_ratio: alert time relative to event time
    """
    data = df.copy()

    # Clean ID
    data["id_num"] = pd.to_numeric(data["id"], errors="coerce").fillna(0).astype(int)

    # Missing flags
    data["has_alert"] = (~data["time_of_alert"].isna()).astype(int)
    data["has_event"] = (~data["time_of_event"].isna()).astype(int)

    # Lead time for positive samples
    data["lead_time"] = np.where(
        data["has_alert"] & data["has_event"],
        data["time_of_event"] - data["time_of_alert"],
        0.0
    )

    data["time_of_alert_filled"] = data["time_of_alert"].fillna(0.0)
    data["time_of_event_filled"] = data["time_of_event"].fillna(0.0)

    return data


def train_models(dataset_path: str, models_dir: str):
    """Full training, evaluation, and serialization pipeline."""
    os.makedirs(models_dir, exist_ok=True)
    df_raw = load_dataset(dataset_path)

    print("=========================================================")
    print("           SNOOZERS // ML DATASET TRAINING PIPELINE      ")
    print("=========================================================")
    print(f"Dataset location: {dataset_path}")
    print(f"Total samples: {len(df_raw)}")
    print(f"Target distribution:\n{df_raw['target'].value_counts().to_dict()}\n")

    df_feat = engineer_features(df_raw)

    # -------------------------------------------------------------
    # 1. Event Classification (Predict Target: 0 vs 1)
    # -------------------------------------------------------------
    # Classification feature set based on ID and alert presence/timing
    feature_cols_clf = ["id_num", "has_alert", "time_of_alert_filled"]
    X_clf = df_feat[feature_cols_clf]
    y_clf = df_feat["target"]

    X_train_c, X_test_c, y_train_c, y_test_c = train_test_split(
        X_clf, y_clf, test_size=0.25, random_state=42, stratify=y_clf
    )

    clf = RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42)
    clf.fit(X_train_c, y_train_c)

    y_pred_c = clf.predict(X_test_c)
    y_proba_c = clf.predict_proba(X_test_c)[:, 1]

    acc = accuracy_score(y_test_c, y_pred_c)
    prec = precision_score(y_test_c, y_pred_c, zero_division=0)
    rec = recall_score(y_test_c, y_pred_c, zero_division=0)
    f1 = f1_score(y_test_c, y_pred_c, zero_division=0)
    roc_auc = roc_auc_score(y_test_c, yproba := y_proba_c)

    # 5-fold Stratified CV
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(clf, X_clf, y_clf, cv=cv, scoring="roc_auc")

    print("--- 1. Event Classifier Results ---")
    print(f"Accuracy  : {acc * 100:.2f}%")
    print(f"Precision : {prec:.4f}")
    print(f"Recall    : {rec:.4f}")
    print(f"F1 Score  : {f1:.4f}")
    print(f"ROC-AUC   : {roc_auc:.4f}")
    print(f"5-Fold CV ROC-AUC: {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")
    print("\nConfusion Matrix:")
    print(confusion_matrix(y_test_c, y_pred_c))
    print("\nClassification Report:")
    print(classification_report(y_test_c, y_pred_c))

    # Feature Importance
    feat_imp = dict(zip(feature_cols_clf, clf.feature_importances_))
    print("Feature Importances:", feat_imp)

    # -------------------------------------------------------------
    # 2. Alert Lead-Time & Event Time Regressors (For target == 1)
    # -------------------------------------------------------------
    df_pos = df_feat[df_feat["target"] == 1].copy()
    print(f"\nPositive alert instances for timing regression: {len(df_pos)}")

    # Predict time_of_event given time_of_alert and id_num
    X_reg = df_pos[["id_num", "time_of_alert"]]
    y_event = df_pos["time_of_event"]
    y_lead = df_pos["lead_time"]

    X_train_r, X_test_r, y_train_r, y_test_r = train_test_split(
        X_reg, y_event, test_size=0.25, random_state=42
    )

    reg_event = GradientBoostingRegressor(n_estimators=100, max_depth=4, random_state=42)
    reg_event.fit(X_train_r, y_train_r)

    y_pred_r = reg_event.predict(X_test_r)
    r2_event = r2_score(y_test_r, y_pred_r)
    mae_event = mean_absolute_error(y_test_r, y_pred_r)
    rmse_event = np.sqrt(mean_squared_error(y_test_r, y_pred_r))

    print("\n--- 2. Time-of-Event Regressor Results ---")
    print(f"R² Score : {r2_event:.4f}")
    print(f"MAE      : {mae_event:.4f} seconds")
    print(f"RMSE     : {rmse_event:.4f} seconds")

    # Lead-Time Regressor
    reg_lead = RandomForestRegressor(n_estimators=100, max_depth=4, random_state=42)
    reg_lead.fit(X_reg, y_lead)

    # -------------------------------------------------------------
    # 3. Save Trained Models & Metadata
    # -------------------------------------------------------------
    clf_path = os.path.join(models_dir, "snoozer_classifier.pkl")
    reg_event_path = os.path.join(models_dir, "event_time_regressor.pkl")
    reg_lead_path = os.path.join(models_dir, "lead_time_regressor.pkl")
    meta_path = os.path.join(models_dir, "snoozer_model_metadata.json")

    joblib.dump(clf, clf_path)
    joblib.dump(reg_event, reg_event_path)
    joblib.dump(reg_lead, reg_lead_path)

    metadata = {
        "dataset_path": dataset_path,
        "total_samples": len(df_raw),
        "target_distribution": df_raw["target"].value_counts().to_dict(),
        "classifier": {
            "model_type": "RandomForestClassifier",
            "features": feature_cols_clf,
            "accuracy": float(acc),
            "precision": float(prec),
            "recall": float(rec),
            "f1_score": float(f1),
            "roc_auc": float(roc_auc),
            "cv_roc_auc_mean": float(cv_scores.mean()),
            "feature_importances": {k: float(v) for k, v in feat_imp.items()}
        },
        "event_time_regressor": {
            "model_type": "GradientBoostingRegressor",
            "features": ["id_num", "time_of_alert"],
            "r2_score": float(r2_event),
            "mae_seconds": float(mae_event),
            "rmse_seconds": float(rmse_event)
        },
        "lead_time_stats": {
            "mean_lead_seconds": float(df_pos["lead_time"].mean()),
            "std_lead_seconds": float(df_pos["lead_time"].std()),
            "min_lead_seconds": float(df_pos["lead_time"].min()),
            "max_lead_seconds": float(df_pos["lead_time"].max())
        }
    }

    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)

    print("\n=========================================================")
    print("                 TRAINING COMPLETE                       ")
    print("=========================================================")
    print(f"Artifacts saved:")
    print(f"  - Classifier       : {clf_path}")
    print(f"  - Event Regressor  : {reg_event_path}")
    print(f"  - Lead Regressor   : {reg_lead_path}")
    print(f"  - Metadata & Stats : {meta_path}")
    print("=========================================================")

    return metadata


if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    dataset_file = os.path.join(base_dir, "datasets", "snoozer_events.csv")
    models_directory = os.path.join(base_dir, "models")
    train_models(dataset_file, models_directory)
