---
tags:
  - authentication
  - jwt
  - debugging
author: demo-user
project: backend-api
---
# Authentication Debugging Session

## Problem
JWT token validation was failing intermittently in production.
Users reported being logged out randomly after 10-15 minutes,
even though the token expiry was set to 1 hour.

### Error Log
```
Error: TokenExpiredError: jwt expired
  at /app/middleware/auth.ts:42:11
  at processTicksAndRejections (node:internal/process/task_queues:95:5)
```

## Investigation
- Checked server clock sync — NTP was configured correctly
- Compared token `iat` (issued at) timestamps with server time
- Found a 45-minute clock skew between API server and auth service

## Solution
The auth service was running in a container with a drifted system clock.

```typescript
// Added clock tolerance to JWT verification
const decoded = jwt.verify(token, SECRET, {
  clockTolerance: 60, // allow 60 seconds of clock skew
});
```

Also fixed the root cause by enabling NTP sync in the Docker container:
```dockerfile
RUN apt-get update && apt-get install -y ntpdate
CMD ntpdate -s pool.ntp.org && node server.js
```

## Learnings
- Always configure clock tolerance for distributed JWT validation
- Container clocks can drift if the host NTP is not propagated
- Add monitoring for clock skew between services
- The `clockTolerance` option is safer than extending token expiry

## Time Spent
Investigation: 2 hours
Fix + deployment: 30 minutes
