#!/usr/bin/env python3
"""
Upload city_league_analysis.parquet to Cloudflare R2.

Requires environment variables (set as GitHub Actions secrets):
    R2_ACCESS_KEY_ID      - Cloudflare R2 API token Access Key ID
    R2_SECRET_ACCESS_KEY  - Cloudflare R2 API token Secret Access Key
    R2_ACCOUNT_ID         - Cloudflare Account ID
    R2_BUCKET             - R2 bucket name (e.g. thedipidis-data)

Usage:
    python scripts/upload_to_r2.py

The file will be uploaded with public Cache-Control and Content-Type
headers so it can be fetched directly from the R2 public URL or a
custom domain (data.thedipidis.app).
"""

import os
import sys

import boto3
from botocore.config import Config

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
LOCAL_FILE = os.path.join(DATA_DIR, "city_league_analysis.parquet")
REMOTE_KEY = "city_league_analysis.parquet"


def upload_to_r2():
    # ------------------------------------------------------------------ #
    # Read credentials from environment
    # ------------------------------------------------------------------ #
    access_key = os.environ.get("R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
    account_id = os.environ.get("R2_ACCOUNT_ID")
    bucket = os.environ.get("R2_BUCKET")

    missing = [k for k, v in {
        "R2_ACCESS_KEY_ID": access_key,
        "R2_SECRET_ACCESS_KEY": secret_key,
        "R2_ACCOUNT_ID": account_id,
        "R2_BUCKET": bucket,
    }.items() if not v]

    if missing:
        print(f"[upload_to_r2] ERROR: missing env vars: {missing}", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(LOCAL_FILE):
        print(f"[upload_to_r2] ERROR: {LOCAL_FILE} not found — run build_parquet.py first", file=sys.stderr)
        sys.exit(1)

    # ------------------------------------------------------------------ #
    # Build S3-compatible client for Cloudflare R2
    # ------------------------------------------------------------------ #
    endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )

    size_mb = os.path.getsize(LOCAL_FILE) / 1_048_576
    print(f"[upload_to_r2] Uploading {LOCAL_FILE} ({size_mb:.2f} MB) → s3://{bucket}/{REMOTE_KEY}")

    s3.upload_file(
        LOCAL_FILE,
        bucket,
        REMOTE_KEY,
        ExtraArgs={
            "ContentType": "application/octet-stream",
            "CacheControl": "public, max-age=3600",
        },
    )

    print(f"[upload_to_r2] Upload complete.")
    print(f"[upload_to_r2] Public URL: https://data.thedipidis.app/{REMOTE_KEY}")


if __name__ == "__main__":
    upload_to_r2()
