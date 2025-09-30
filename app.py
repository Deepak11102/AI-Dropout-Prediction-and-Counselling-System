# app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os

app = Flask(__name__)
CORS(app)
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-latest:generateContent?key=AIzaSyCZsQMNUsIPP0YrtAeYVnjB7hsrFvobL9k"


@app.route('/chat', methods=['POST'])
def chat_with_gemini():
    """
    Receives a prompt and student context from the frontend, formats a request for the Gemini API,
    and returns the model's response.
    """
    try:
        data = request.get_json()
        user_prompt = data.get('prompt')
        student_context = data.get('student')

        if not user_prompt:
            return jsonify({"error": "Prompt is missing"}), 400
        if not student_context:
            return jsonify({"error": "Student context is missing"}), 400

        # Construct the system instruction
        system_prompt = (
            f"You are \"Sentinel Assistant\", a helpful and empathetic AI for university students. "
            f"The student you are talking to is {student_context.get('name', 'a student')}. "
            f"Their current GPA is {student_context.get('gpa', 0):.1f}. "
            f"Keep responses concise, supportive, and under 50 words. "
            f"Guide them to on-campus resources like the \"Academic Success Center\" or "
            f"\"Student Wellness Center\" when appropriate."
        )

        # Payload for the Gemini API
        payload = {
            "contents": [{"parts": [{"text": user_prompt}]}],
            "systemInstruction": {"parts": [{"text": system_prompt}]},
        }

        # Send the request to the Gemini API
        response = requests.post(GEMINI_API_URL, json=payload)
        response.raise_for_status()
        
        response_data = response.json()
        
        # Safely extract the generated text
        candidates = response_data.get('candidates', [])
        if candidates and 'content' in candidates[0] and 'parts' in candidates[0]['content'] and candidates[0]['content']['parts']:
            generated_text = candidates[0]['content']['parts'][0].get('text', 'Sorry, I could not generate a response.')
        else:
            generated_text = 'Sorry, the response from the AI was not in the expected format.'
            print("Unexpected Gemini response format:", response_data)

        return jsonify({"generated_text": generated_text})

    except requests.exceptions.RequestException as e:
        print(f"Error connecting to Gemini API: {e}")
        return jsonify({"error": "Could not connect to the Gemini AI service."}), 500
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return jsonify({"error": "An internal server error occurred."}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)


