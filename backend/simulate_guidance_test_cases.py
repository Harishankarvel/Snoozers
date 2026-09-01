import os
import sys
import json
import csv

# Ensure backend path is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.engine.decision_engine import GuidanceModule

def run_simulation():
    print("=" * 90)
    print("          GUIDANCE MODULE SIMULATOR — HAZARD EVENT TO JUSTIFIED ACTION          ")
    print("=" * 90)
    
    datasets_dir = os.path.join(backend_dir, "datasets")
    dataset_files = [
        "dataset_low_risk.json",
        "dataset_medium_risk.json",
        "dataset_high_risk.json"
    ]
    
    guidance = GuidanceModule(ttc_critical_threshold=2.5, ttc_caution_threshold=4.5)
    all_results = []
    
    for fname in dataset_files:
        fpath = os.path.join(datasets_dir, fname)
        if not os.path.exists(fpath):
            print(f"[-] Missing dataset: {fname}")
            continue
            
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        scenario_name = data.get("scenario_name", fname)
        risk_category = data.get("risk_category", "UNKNOWN")
        expected_action = data.get("expected_action", "N/A")
        events = data.get("events", [])
        
        print(f"\n>> EXECUTING SCENARIO: [{risk_category}] {scenario_name}")
        print(f"   Target Expected Action: '{expected_action}'")
        print("-" * 90)
        print(f"{'Tick(s)':<8} | {'Ego (km/h)':<10} | {'Hazard ID/Class':<18} | {'Dist (m)':<9} | {'TTC (s)':<8} | {'Risk':<8} | {'Action Assigned'}")
        print("-" * 90)
        
        for evt in events:
            t_offset = evt.get("timestamp_offset_sec", 0.0)
            ego_spd = evt.get("ego_speed_kmh", 60.0)
            objs = evt.get("tracked_objects", [])
            
            result = guidance.evaluate_hazard_event(objs, ego_speed=ego_spd)
            
            primary_hazard = result.get("primary_hazard")
            hazard_str = f"#{primary_hazard.get('id', '?')} {primary_hazard.get('class', '')}" if primary_hazard else "None"
            dist_str = f"{primary_hazard.get('z', 0.0):.1f}m" if primary_hazard else "--"
            ttc_val = result.get("min_ttc")
            ttc_str = f"{ttc_val:.1f}s" if ttc_val < 90 else "Inf"
            
            risk_res = result.get("risk_level")
            action_res = result.get("action")
            justification = result.get("justification")
            
            print(f"{t_offset:<8.1f} | {ego_spd:<10.1f} | {hazard_str:<18} | {dist_str:<9} | {ttc_str:<8} | {risk_res:<8} | {action_res}")
            
            all_results.append({
                "scenario": scenario_name,
                "dataset_file": fname,
                "timestamp_offset": t_offset,
                "ego_speed_kmh": ego_spd,
                "hazard_summary": hazard_str,
                "distance_meters": primary_hazard.get('z', 0.0) if primary_hazard else None,
                "calculated_ttc_sec": ttc_val if ttc_val < 90 else "Infinity",
                "risk_level": risk_res,
                "action": action_res,
                "justification": justification,
                "test_passed": (risk_res == risk_category and action_res == expected_action)
            })
            
    print("\n" + "=" * 90)
    print("                              EVALUATION SUMMARY                              ")
    print("=" * 90)
    
    passed_count = sum(1 for r in all_results if r["test_passed"])
    total_count = len(all_results)
    
    for r in all_results:
        status_icon = "PASS" if r["test_passed"] else "FAIL"
        print(f"[{status_icon}] Scenario: {r['scenario']} (Tick +{r['timestamp_offset']}s) -> {r['risk_level']} | {r['action']}")
        print(f"       Justification: \"{r['justification']}\"")
        
    print("-" * 90)
    print(f"TOTAL TESTS: {total_count} | PASSED: {passed_count} | ACCURACY: {(passed_count/total_count)*100:.1f}%\n")
    
    # Save CSV Results
    csv_path = os.path.join(datasets_dir, "guidance_test_results.csv")
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        fieldnames = [
            "scenario", "dataset_file", "timestamp_offset", "ego_speed_kmh", 
            "hazard_summary", "distance_meters", "calculated_ttc_sec", 
            "risk_level", "action", "justification", "test_passed"
        ]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_results)
        
    print(f"[+] Detailed simulation test results exported to: {csv_path}")

if __name__ == "__main__":
    run_simulation()
