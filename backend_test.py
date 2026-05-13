#!/usr/bin/env python3
"""
Backend API Testing Script for Feedback Endpoint
Tests the POST /api/feedback endpoint end-to-end
"""

import requests
import time
import json
from datetime import datetime

# Backend URL from environment
BACKEND_URL = "https://slider-preview-2.preview.emergentagent.com/api"

def test_feedback_endpoint():
    """Test POST /api/feedback endpoint with all scenarios"""
    
    print("=" * 80)
    print("TESTING POST /api/feedback ENDPOINT")
    print("=" * 80)
    print()
    
    # Get initial MongoDB count
    print("Step 0: Getting initial MongoDB feedback count...")
    try:
        import subprocess
        result = subprocess.run(
            ['mongosh', 'mongodb://localhost:27017/test_database', '--eval', 'db.feedback.countDocuments()'],
            capture_output=True,
            text=True,
            timeout=10
        )
        initial_count_output = result.stdout.strip()
        # Extract the number from the output
        initial_count = None
        for line in initial_count_output.split('\n'):
            line = line.strip()
            if line.isdigit():
                initial_count = int(line)
                break
        print(f"Initial feedback count: {initial_count}")
    except Exception as e:
        print(f"Warning: Could not get initial MongoDB count: {e}")
        initial_count = None
    print()
    
    # Test 1: POST with all fields populated
    print("-" * 80)
    print("TEST 1: POST /api/feedback with all fields populated")
    print("-" * 80)
    
    payload1 = {
        "name": "QA Test Bot",
        "liked": "The new mobile heatmap fills the screen nicely.",
        "disliked": "Nothing major.",
        "wished": "Optional: dark mode toggle in the bottom tab bar.",
        "group_code": "QA1234"
    }
    
    print(f"Payload: {json.dumps(payload1, indent=2)}")
    
    start_time = time.time()
    try:
        response1 = requests.post(
            f"{BACKEND_URL}/feedback",
            json=payload1,
            timeout=10
        )
        elapsed_time1 = time.time() - start_time
        
        print(f"Status Code: {response1.status_code}")
        print(f"Response Time: {elapsed_time1:.3f}s")
        print(f"Response Body: {response1.text}")
        
        if response1.status_code == 200:
            data = response1.json()
            if data.get("ok") and "id" in data:
                print("✅ TEST 1 PASSED: 200 OK with {ok: true, id: <uuid>}")
            else:
                print(f"❌ TEST 1 FAILED: Response body missing 'ok' or 'id': {data}")
        else:
            print(f"❌ TEST 1 FAILED: Expected 200, got {response1.status_code}")
    except Exception as e:
        print(f"❌ TEST 1 FAILED: Exception occurred: {e}")
    
    print()
    
    # Wait a bit for email to be sent
    print("Waiting 5 seconds for email to be sent...")
    time.sleep(5)
    print()
    
    # Test 2: POST with all fields empty/whitespace
    print("-" * 80)
    print("TEST 2: POST /api/feedback with all fields empty/whitespace")
    print("-" * 80)
    
    payload2 = {
        "name": "",
        "liked": "  ",
        "disliked": None,
        "wished": ""
    }
    
    print(f"Payload: {json.dumps(payload2, indent=2)}")
    
    start_time = time.time()
    try:
        response2 = requests.post(
            f"{BACKEND_URL}/feedback",
            json=payload2,
            timeout=10
        )
        elapsed_time2 = time.time() - start_time
        
        print(f"Status Code: {response2.status_code}")
        print(f"Response Time: {elapsed_time2:.3f}s")
        print(f"Response Body: {response2.text}")
        
        if response2.status_code == 400:
            data = response2.json()
            detail = data.get("detail", "")
            if "liked" in detail.lower() or "disliked" in detail.lower() or "wished" in detail.lower():
                print("✅ TEST 2 PASSED: 400 Bad Request with detail mentioning required fields")
            else:
                print(f"❌ TEST 2 FAILED: 400 but detail doesn't mention required fields: {detail}")
        else:
            print(f"❌ TEST 2 FAILED: Expected 400, got {response2.status_code}")
    except Exception as e:
        print(f"❌ TEST 2 FAILED: Exception occurred: {e}")
    
    print()
    
    # Test 3: POST with only the "wished" field
    print("-" * 80)
    print("TEST 3: POST /api/feedback with only 'wished' field")
    print("-" * 80)
    
    payload3 = {
        "wished": "Single-field test"
    }
    
    print(f"Payload: {json.dumps(payload3, indent=2)}")
    
    start_time = time.time()
    try:
        response3 = requests.post(
            f"{BACKEND_URL}/feedback",
            json=payload3,
            timeout=10
        )
        elapsed_time3 = time.time() - start_time
        
        print(f"Status Code: {response3.status_code}")
        print(f"Response Time: {elapsed_time3:.3f}s")
        print(f"Response Body: {response3.text}")
        
        if response3.status_code == 200:
            data = response3.json()
            if data.get("ok") and "id" in data:
                print("✅ TEST 3 PASSED: 200 OK with {ok: true, id: <uuid>}")
            else:
                print(f"❌ TEST 3 FAILED: Response body missing 'ok' or 'id': {data}")
        else:
            print(f"❌ TEST 3 FAILED: Expected 200, got {response3.status_code}")
    except Exception as e:
        print(f"❌ TEST 3 FAILED: Exception occurred: {e}")
    
    print()
    
    # Wait a bit for email to be sent
    print("Waiting 5 seconds for email to be sent...")
    time.sleep(5)
    print()
    
    # Test 4: Check MongoDB count
    print("-" * 80)
    print("TEST 4: Verify MongoDB feedback collection grew by 2 documents")
    print("-" * 80)
    
    try:
        result = subprocess.run(
            ['mongosh', 'mongodb://localhost:27017/test_database', '--eval', 'db.feedback.countDocuments()'],
            capture_output=True,
            text=True,
            timeout=10
        )
        final_count_output = result.stdout.strip()
        # Extract the number from the output
        final_count = None
        for line in final_count_output.split('\n'):
            line = line.strip()
            if line.isdigit():
                final_count = int(line)
                break
        
        print(f"Initial count: {initial_count}")
        print(f"Final count: {final_count}")
        
        if initial_count is not None and final_count is not None:
            delta = final_count - initial_count
            print(f"Delta: {delta}")
            
            if delta == 2:
                print("✅ TEST 4 PASSED: MongoDB feedback collection grew by exactly 2 documents")
            else:
                print(f"❌ TEST 4 FAILED: Expected delta of 2, got {delta}")
        else:
            print("⚠️  TEST 4 SKIPPED: Could not determine initial or final count")
    except Exception as e:
        print(f"❌ TEST 4 FAILED: Exception occurred: {e}")
    
    print()
    
    # Test 5: Check response time
    print("-" * 80)
    print("TEST 5: Verify response time is within ~1 second")
    print("-" * 80)
    
    print(f"Test 1 response time: {elapsed_time1:.3f}s")
    print(f"Test 3 response time: {elapsed_time3:.3f}s")
    
    avg_time = (elapsed_time1 + elapsed_time3) / 2
    print(f"Average response time: {avg_time:.3f}s")
    
    if avg_time <= 1.5:  # Allow some margin
        print("✅ TEST 5 PASSED: Average response time within acceptable range (~1 second)")
    else:
        print(f"⚠️  TEST 5 WARNING: Average response time {avg_time:.3f}s is higher than expected (~1s)")
    
    print()
    
    # Check backend logs for email confirmation
    print("-" * 80)
    print("BACKEND LOGS CHECK: Looking for email confirmation")
    print("-" * 80)
    
    try:
        result = subprocess.run(
            ['tail', '-n', '100', '/var/log/supervisor/backend.err.log'],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        log_lines = result.stdout.strip().split('\n')
        
        # Look for feedback-related log lines
        feedback_logs = [line for line in log_lines if 'feedback' in line.lower() or 'resend' in line.lower()]
        
        if feedback_logs:
            print("Found feedback-related log lines:")
            for line in feedback_logs[-10:]:  # Show last 10 relevant lines
                print(f"  {line}")
            
            # Check for success messages
            success_count = sum(1 for line in feedback_logs if 'Feedback email sent' in line)
            failure_count = sum(1 for line in feedback_logs if 'Failed to send feedback email' in line)
            
            print()
            print(f"Success messages found: {success_count}")
            print(f"Failure messages found: {failure_count}")
            
            if success_count >= 2:
                print("✅ LOGS CHECK PASSED: Found at least 2 'Feedback email sent' messages")
            elif failure_count > 0:
                print("❌ LOGS CHECK FAILED: Found 'Failed to send feedback email' messages")
            else:
                print("⚠️  LOGS CHECK WARNING: Could not find expected email confirmation messages")
        else:
            print("⚠️  No feedback-related log lines found in last 100 lines")
    except Exception as e:
        print(f"⚠️  Could not check backend logs: {e}")
    
    print()
    print("=" * 80)
    print("FEEDBACK ENDPOINT TESTING COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    test_feedback_endpoint()
