# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.0.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public issue.**
2. Use [GitHub Security Advisories](https://github.com/3062-in-zamud/knowledgine/security/advisories/new) to report the vulnerability privately.
3. Alternatively, email the maintainer directly.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix release**: As soon as possible, targeting within 30 days for critical issues

## Security Considerations

knowledgine processes local markdown files and stores data in a local SQLite database. It does not:

- Send data to external services
- Accept network connections (MCP uses stdio)
- Execute arbitrary code from indexed files

However, users should be aware that:

- The SQLite database is stored locally and may contain content from indexed files
- File paths are stored in the database
