import os
import argparse
import google.auth
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

# If modifying these scopes, delete the file token.json.
SCOPES = ["https://www.googleapis.com/auth/drive.file"]

def get_credentials():
    """Gets valid user credentials from storage or runs the OAuth flow."""
    creds = None
    
    # 1. Attempt to load credentials from token.json
    if os.path.exists("token.json"):
        try:
            creds = Credentials.from_authorized_user_file("token.json", SCOPES)
            print("Loaded credentials from token.json")
        except Exception as e:
            print(f"Could not load credentials from token.json: {e}")

    # 2. If no valid credentials, try to refresh or authenticate via flow
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                print("Refreshed expired credentials")
            except Exception as e:
                print(f"Error refreshing credentials: {e}")
                creds = None
        
        # 3. If refresh failed or credentials don't exist, try credentials.json desktop flow
        if not creds:
            if os.path.exists("credentials.json"):
                print("Found credentials.json. Starting local OAuth server flow...")
                flow = InstalledAppFlow.from_client_secrets_file("credentials.json", SCOPES)
                creds = flow.run_local_server(port=0)
                # Save credentials for the next run
                with open("token.json", "w") as token:
                    token.write(creds.to_json())
                print("Saved new credentials to token.json")
            else:
                # 4. Fallback: try Application Default Credentials (ADC)
                print("credentials.json not found. Attempting Application Default Credentials (ADC)...")
                try:
                    creds, project_id = google.auth.default(scopes=SCOPES)
                    print(f"Loaded ambient credentials (ADC). Project: {project_id}")
                except google.auth.exceptions.DefaultCredentialsError:
                    raise Exception(
                        "No credentials found. Please place your client secrets in 'credentials.json' "
                        "or set up Application Default Credentials (ADC)."
                    )
    return creds

def upload_file(local_path, drive_name=None, mimetype=None, parent_id=None):
    """Uploads a local file to Google Drive.
    
    Args:
        local_path (str): Path to the file on local disk.
        drive_name (str): Name of the file in Google Drive. If None, uses local filename.
        mimetype (str): MIME type of the file. If None, the client library guesses it.
        parent_id (str): Optional ID of the parent folder in Google Drive.
    """
    if not os.path.exists(local_path):
        print(f"Error: Local file '{local_path}' does not exist.")
        return None

    try:
        creds = get_credentials()
        service = build("drive", "v3", credentials=creds)

        # Build file metadata
        file_metadata = {}
        file_metadata["name"] = drive_name if drive_name else os.path.basename(local_path)
        if parent_id:
            file_metadata["parents"] = [parent_id]

        # Prepare the media file for upload
        media = MediaFileUpload(local_path, mimetype=mimetype, resumable=True)

        print(f"Uploading '{local_path}' to Google Drive as '{file_metadata['name']}'...")
        file = (
            service.files()
            .create(body=file_metadata, media_body=media, fields="id, name, webViewLink")
            .execute()
        )
        
        print("\nUpload successful!")
        print(f"File ID: {file.get('id')}")
        print(f"File Link: {file.get('webViewLink')}")
        return file.get("id")

    except HttpError as error:
        print(f"An API error occurred: {error}")
        return None
    except Exception as e:
        print(f"An error occurred: {e}")
        return None

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Upload a file to Google Drive using Drive API v3.")
    parser.add_argument("file", help="Path to the local file to upload.")
    parser.add_argument("--name", help="Name to give the file in Google Drive (defaults to local filename).")
    parser.add_argument("--mime", help="MIME type of the file (e.g. image/jpeg, application/pdf).")
    parser.add_argument("--parent", help="Google Drive folder ID to place the file inside.")

    args = parser.parse_args()
    upload_file(local_path=args.file, drive_name=args.name, mimetype=args.mime, parent_id=args.parent)
