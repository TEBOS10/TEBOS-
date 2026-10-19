# Connecting outside AI tools (founder's request, 19 Oct 2026)

The request was to connect ChatGPT, OmniRoute, Graphify, Headroom, claude-code-setup, Gojiberry, a VPS and Getlayers,
"so we have unlimited usage on every platform". This page records what each tool is, how it connects, and what it
may touch.

**Two truths first:**
1. **No route gives unlimited usage.** Free model tiers have rate limits, and some providers train on what they're
   sent. The aim is *no stoppages*: when one provider runs out, the work continues on another.
2. **Two places use AI, and they connect differently:**
   - **These Claude Code sessions** run in a managed cloud container. Their model connection can't be re-pointed at a
     router from inside the session.
   - **TEBOS's own worker** (Railway) calls a model itself. This is where a router belongs. It is also what makes TEBOS
     independent of any one AI company, which is the founder's aim.

## Each tool

| Tool | What it is (sources checked 19 Oct) | Where it goes | Status |
|---|---|---|---|
| **OmniRoute** | Open-source (MIT) AI gateway. One OpenAI-compatible endpoint with fallback: subscription → API key → cheap → free models. A Railway template exists. Reported CVEs, so check the advisories first | **TEBOS's model gateway** on Railway, private network only. The worker calls it, so analysis keeps running when one provider fails or runs out | Design below. Needs the founder's provider keys, set in Railway |
| **ChatGPT** | Two separate routes: <br>• a ChatGPT *subscription* is not an API; <br>• the OpenAI *API* needs its own key | <br>• **As a model:** an OpenAI API key in OmniRoute, as a fallback provider; <br>• **As a client that takes work:** the Model Bridge (`docs/bridge.md`), chat-assistant phase. ChatGPT connectors sign in with OAuth, which the bridge doesn't do yet | API key: the founder's to create. Bridge OAuth: to be built after the bridge is live |
| **Headroom** | Open-source (Apache-2.0) context compressor. It sits in front of the model and shrinks tool output and logs. Project-reported saving: about 20% on code | **Inside the TEBOS gateway**, in front of OmniRoute, for the worker's long inputs. On the founder's own computer, `headroom wrap claude` works for local Claude Code sessions | After the gateway |
| **Graphify** | Turns a codebase into a knowledge graph that Claude Code queries instead of reading files. Code is parsed locally. An independent test found about 5–10× fewer tokens, not the 70× claimed | **The repository**, for local sessions. Install it on the founder's computer with `graphify install` in the repo | Founder's computer. It can't be installed into this managed session's configuration |
| **claude-code-setup** | An official Anthropic plugin. It reads a repository and recommends hooks, skills, MCP servers and subagents | **This account's Claude Code** | Install card shown in the chat, 19 Oct. One click |
| **Gojiberry** | A lead-finding and outreach service. No public API documentation was found; its ChatGPT plugin takes an API key | **Not connected.** TEBOS already has Apollo connected for prospecting. Lead lists also need a POPIA basis, and outreach stays a draft until a person approves it | Revisit only if Apollo falls short |
| **VPS** | A server for running services | **Railway already provides this.** The worker runs there, and OmniRoute and Headroom deploy there as private services. No new server account is needed | — |
| **Getlayers** | A library of website sections, templates, Three.js scenes and video backgrounds, with an MCP integration for coding assistants | **Proposal 6, the design system** (yes, 19 Oct): as a reference and asset source, applied without copying brands | Founder adds its connector in claude.ai, if it is wanted as a live tool. Its paid plan needs a spend decision |

## The TEBOS model gateway (the part that makes TEBOS independent)

```
worker ──► Headroom (compress) ──► OmniRoute (route + fallback) ──► Anthropic │ OpenAI │ cheaper providers
           private Railway network only; nothing public
```

- **Built (19 Oct), in `src/intelligence/gateway-provider.ts`:**
  - **`GatewayProvider`** calls any OpenAI-compatible endpoint, with the answer constrained to the task's schema.
  - **`FallbackProvider`** moves to the next provider only when a provider itself fails (unavailable or
    misconfigured). A refusal or a bad answer is never retried elsewhere.
  - **The worker's order:**
    - Claude first, when `ANTHROPIC_API_KEY` is set;
    - then the gateway, when `TEBOS_MODEL_GATEWAY_URL` is set (with `TEBOS_GATEWAY_MODEL`, and
      `TEBOS_MODEL_GATEWAY_KEY` if the gateway requires one).

    With neither set, analysis stays off, as before.
- **Data rule (set in the gateway's configuration):**
  - `TEBOS_GATEWAY_MODEL` must name a paid route whose provider doesn't train on API data, because the worker sends
    clients' business data;
  - free tiers are not configured for TEBOS's worker;
  - secrets are never sent (the existing secret refusal applies).
- **Logging:**
  - each analysis already records the provider and model that actually answered (`anthropic` or `gateway`);
  - a failed run names the chain it tried (`anthropic+gateway`).
- **Failure:** if every provider fails, the existing pause applies (analysis paused, nothing counted against a business).
- **Keys:** the founder's provider keys go only into Railway variables on the OmniRoute service. They are never pasted
  into chat or put in the code.
