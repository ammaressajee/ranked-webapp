"""
Run all Cloud Functions locally on port 5000.
Use this when Firebase emulator fails (e.g. missing venv).

  python run_local.py

Then set Angular environment.development.ts:
  functionsUrl: 'http://127.0.0.1:5000'

Requires: pip install -r requirements.txt
"""
from flask import Flask, request
from main import find_match, accept_match, decline_match, sweep_pending_matches, queue_count

app = Flask(__name__)

@app.route('/find_match', methods=['POST', 'OPTIONS'])
def route_find_match():
    return _handle(find_match)

@app.route('/accept_match', methods=['POST', 'OPTIONS'])
def route_accept_match():
    return _handle(accept_match)

@app.route('/decline_match', methods=['POST', 'OPTIONS'])
def route_decline_match():
    return _handle(decline_match)

@app.route('/sweep_pending_matches', methods=['GET', 'POST', 'OPTIONS'])
def route_sweep():
    return _handle(sweep_pending_matches)

@app.route('/queue_count', methods=['GET', 'OPTIONS'])
def route_queue_count():
    return _handle(queue_count)

def _handle(handler):
    result = handler(request)
    if isinstance(result, tuple):
        resp, status = result[0], result[1]
        headers = result[2] if len(result) > 2 else {}
        for k, v in (headers or {}).items():
            resp.headers[k] = str(v)
        return resp, status
    return result

if __name__ == '__main__':
    print('Cloud Functions running at http://127.0.0.1:5000')
    print('Endpoints: /find_match, /accept_match, /decline_match, /sweep_pending_matches, /queue_count')
    app.run(host='127.0.0.1', port=5000, debug=True)
