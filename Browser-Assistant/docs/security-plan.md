# Security Plan — AI Chrome Extension

## 1. Security Principles

1. **Least Privilege**: Request only necessary permissions
2. **Data Minimization**: Send only required data to API
3. **Local First**: Keep data on device whenever possible
4. **Defense in Depth**: Multiple layers of security
5. **Secure by Default**: Safe defaults out of the box

## 2. API Key Security

### 2.1 Storage

- API keys stored in `chrome.storage.local` (device-level encryption)
- Keys encrypted at rest using AES-256-GCM
- Encryption key derived from device-specific material
- Never stored in plain text

### 2.2 Transmission

- API key sent only to OpenCode Zen API endpoint
- Always over HTTPS
- Never logged or stored in plain text
- Never included in error messages

### 2.3 Code Protection

- API key never exposed in content scripts
- Only background service worker handles API calls
- No API key in console logs
- Source maps disabled in production

### 2.4 User Interface

- API key masked in settings UI
- Show only last 4 characters when displayed
- Provide clear/rotate functionality
- Warn user if key might be compromised

## 3. Content Security

### 3.1 Content Script Isolation

- Content scripts run in isolated world
- No direct DOM manipulation of host pages
- Only read operations on page content
- No injection of scripts into host pages

### 3.2 Content Sanitization

```typescript
// Before sending to API
function sanitizeContent(content: string): string {
  return content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')  // Remove scripts
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')    // Remove styles
    .replace(/on\w+="[^"]*"/gi, '')                     // Remove event handlers
    .replace(/javascript:/gi, '')                        // Remove JS URIs
    .trim();
}
```

### 3.3 Response Handling

- AI responses rendered as plain text/markdown
- No HTML injection from AI responses
- Markdown rendered with sanitization
- Code blocks syntax-highlighted safely

### 3.4 XSS Prevention

- React's built-in XSS protection
- No `dangerouslySetInnerHTML` for user content
- All dynamic content escaped
- CSP headers enforced

## 4. Network Security

### 4.1 Content Security Policy

```
extension_pages: 
  script-src 'self';
  object-src 'self';
  style-src 'self' 'unsafe-inline';
  connect-src https://api.opencodezen.com;
  img-src 'self' data:;
  font-src 'self';
```

### 4.2 Allowed Connections

| Destination | Protocol | Purpose |
|------------|----------|---------|
| api.opencodezen.com | HTTPS | AI API calls |
| (no other external) | - | - |

### 4.3 Request Validation

- Validate all API responses
- Check response content-type
- Verify response structure
- Handle malformed responses gracefully

## 5. Data Privacy

### 5.1 Data Collection

The extension collects:
- Page content (processed locally, sent to API only when user sends message)
- Selected text (processed locally)
- User messages (sent to API for AI processing)
- Settings (stored locally only)

### 5.2 Data Transmission

| Data | Sent to API | Stored Locally | Retained |
|------|------------|----------------|----------|
| API Key | Yes (auth header) | Yes (encrypted) | Until changed |
| Page Content | Yes (with user message) | Temporarily (cache) | 5 minutes |
| User Messages | Yes | Yes | Until deleted |
| AI Responses | No | Yes | Until deleted |
| Settings | No | Yes | Until changed |
| Selected Text | Yes (with message) | No | Until sent |

### 5.3 Data Retention

- Conversations: User-controlled (delete anytime)
- Page cache: Auto-cleared after 5 minutes
- Settings: Persist until changed/uninstalled
- No analytics or telemetry collected
- No data shared with third parties

### 5.4 GDPR Compliance

- No personal data collection beyond what's necessary
- User can export all data
- User can delete all data
- Clear privacy policy provided
- No tracking or profiling

## 6. Extension Security

### 6.1 Permissions

Minimal permissions requested:
- `activeTab`: Only when user activates extension
- `storage`: For local data persistence
- `sidePanel`: For UI presentation
- `scripting`: For content script injection
- `host_permissions`: Only for API endpoint

### 6.2 Manifest Security

```json
{
  "manifest_version": 3,
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  },
  "minimum_chrome_version": "114"
}
```

### 6.3 No Remote Code

- All code bundled locally
- No dynamic script loading
- No eval() or new Function()
- No remote resources (fonts, scripts, etc.)

## 7. Error Handling Security

### 7.1 Error Messages

- Never expose API keys in errors
- Never expose full stack traces to users
- Generic error messages for security failures
- Detailed logging only in development

### 7.2 Sensitive Data in Logs

```typescript
// NEVER do this
console.log('API Key:', apiKey);
console.log('Full page content:', content);

// DO this instead
console.log('API request sent, response status:', response.status);
console.log('Content length:', content.length);
```

## 8. Update Security

### 8.1 Code Updates

- Updates through Chrome Web Store only
- No self-updating mechanism
- Signed extension packages
- Review before publishing

### 8.2 Dependency Security

- Regular dependency audits
- Lock file committed (package-lock.json)
- No wildcard versions
- Automated vulnerability scanning

## 9. Incident Response

If a security issue is discovered:
1. Assess severity and impact
2. Prepare fix immediately
3. Submit to Chrome Web Store for expedited review
4. Notify users through extension update notes
5. Document the issue and fix

## 10. Security Checklist

- [ ] API key encrypted at rest
- [ ] All connections over HTTPS
- [ ] Content scripts isolated
- [ ] No remote code execution
- [ ] XSS prevention implemented
- [ ] Input validation on all user inputs
- [ ] Error messages sanitized
- [ ] Minimal permissions requested
- [ ] No sensitive data in logs
- [ ] CSP properly configured
- [ ] Response validation implemented
- [ ] Rate limiting on API calls
- [ ] Data retention policies enforced
- [ ] Privacy policy documented
