import os
import requests
import feedparser
from flask import Flask, jsonify, render_template

app = Flask(__name__)

# Feed URL for BigQuery release notes
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/notes")
def get_release_notes():
    try:
        # Fetch the feed
        response = requests.get(FEED_URL, timeout=10)
        response.raise_for_status()
        
        # Parse feed content
        feed = feedparser.parse(response.content)
        
        notes = []
        for entry in feed.entries:
            # Extract content value
            content_val = ""
            if "content" in entry and len(entry.content) > 0:
                content_val = entry.content[0].value
            elif "summary" in entry:
                content_val = entry.summary
                
            notes.append({
                "id": entry.get("id", ""),
                "title": entry.get("title", "No Title"),
                "updated": entry.get("updated", ""),
                "link": entry.get("link", ""),
                "content": content_val
            })
            
        return jsonify({
            "status": "success",
            "feed_title": feed.feed.get("title", "BigQuery Release Notes"),
            "notes": notes
        })
        
    except requests.exceptions.RequestException as e:
        app.logger.error(f"Network error fetching feed: {e}")
        return jsonify({
            "status": "error",
            "message": f"Network error while fetching release notes: {str(e)}"
        }), 500
    except Exception as e:
        app.logger.error(f"Error parsing feed: {e}")
        return jsonify({
            "status": "error",
            "message": f"An error occurred while parsing the feed: {str(e)}"
        }), 500

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
