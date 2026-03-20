---
tags:
  - docker
  - networking
  - devops
author: demo-user
project: microservices
---
# Docker Container Networking Issues

## Problem
Containers in docker-compose could not communicate with each other.
The API service failed to connect to the database container.

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

## Investigation
- Verified both containers were running: `docker ps` showed healthy status
- Checked network: `docker network ls` showed custom bridge network
- The API was using `localhost` instead of the service name

## Solution
Docker containers have their own network namespace. Use the service
name as the hostname, not `localhost`.

```yaml
# docker-compose.yml
services:
  api:
    build: ./api
    environment:
      # Wrong: DB_HOST=localhost
      DB_HOST: postgres  # Use service name
      DB_PORT: 5432
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      timeout: 3s
      retries: 5
```

## Additional Fix: DNS Resolution Timing
Even with correct hostnames, the API started before DNS was ready.

```typescript
// Added retry logic for database connection
async function connectWithRetry(maxRetries = 5): Promise<Pool> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const pool = new Pool({ host: process.env.DB_HOST });
      await pool.query("SELECT 1");
      return pool;
    } catch (err) {
      console.log(`DB connection attempt ${i + 1} failed, retrying...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("Could not connect to database");
}
```

## Learnings
- Never use `localhost` for inter-container communication
- Use `depends_on` with health checks, not just service ordering
- Add connection retry logic for resilience
- `docker network inspect` is useful for debugging DNS issues
