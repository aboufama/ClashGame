
# Clash Isometric - Database Setup

This project uses a Postgres database for persistent user accounts and multiplayer features. It supports Vercel Postgres or any standard Postgres provider (like AWS Aurora).

## Connecting to AWS Aurora

To connect your Vercel deployment to your AWS Aurora cluster:

1.  **Get Configuration**: You need your **Writer Endpoint**, **Username**, **Password**, and **Database Name**.
    *   Example Writer Endpoint: `clash-iso-game.cluster-capgycoa0cyu.us-east-1.rds.amazonaws.com`
    
2.  **Set Environment Variable**:
    In your Vercel Project Settings -> Environment Variables, add:
    ```
    POSTGRES_URL="postgres://USERNAME:PASSWORD@WRITER_ENDPOINT:5432/DATABASE_NAME"
    ```
    *   Replace `USERNAME`, `PASSWORD`, `WRITER_ENDPOINT`, and `DATABASE_NAME` with your actual values.
    *   Example: `postgres://admin:mypassword123@clash-iso-game.cluster-capgycoa0cyu.us-east-1.rds.amazonaws.com:5432/clash-iso-game`

3.  **Network Access (Crucial)**:
    Since Vercel uses dynamic IP addresses, you must configure your AWS Aurora **Security Group** to allow inbound traffic:
    *   **Type**: PostgreSQL (TCP)
    *   **Port**: 5432
    *   **Source**: `0.0.0.0/0` (Allow all IPv4) - *Note: For tighter security, you would need a VPC peering or Vercel Secure Compute, but 0.0.0.0/0 is standard for serverless access.*
    *   Also ensure your Aurora instance is set to **Publicly Accessible: Yes**.

4.  **Initialize Database**:
    Once deployed, visit this URL *once* to create the required tables:
    `https://YOUR_VERCEL_URL.vercel.app/api/setup`
