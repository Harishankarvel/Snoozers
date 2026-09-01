"""
Root-level script to train models on the dataset.
Execute with:
    & d:/Snoozers/.venv/Scripts/python.exe d:/Snoozers/train_dataset.py
"""

import os
import sys

# Add backend directory to sys.path
root_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.join(root_dir, "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.ml.train_snoozer_dataset import train_models

if __name__ == "__main__":
    dataset_file = os.path.join(backend_dir, "datasets", "snoozer_events.csv")
    models_directory = os.path.join(backend_dir, "models")
    train_models(dataset_file, models_directory)
