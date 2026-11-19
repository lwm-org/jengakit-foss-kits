"""jengaKit Platform SDK — jengakit_agent (Python twin of jengakit_agent.js).

Gives ANY Python kit a bounded ReAct agent over the simple
``call_llm(prompt, system) -> str`` completion interface. NOT a
sandbox/container spawner — the kit is ALREADY an isolated container on the
platform, so tools run in-process.

    agent = Agent(system_prompt=..., tools=[...], autonomy="supervised",
                  max_steps=6, llm=call_llm)
    result = agent.run(user_text, history, on_event=cb)  # -> {text, trace, steps}

tools: [{"name", "description", "side_effecting"?, "run": callable(args)->str}]
autonomy: "readonly" | "supervised" | "auto"   (gates side-effecting tools)
llm: callable(prompt, system_prompt) -> str | None

Tool protocol (the model is told this): to call a tool, emit EXACTLY
    <use name="TOOLNAME">{"arg": "value"}</use>
The loop runs the tool, feeds back <result>...</result>, and repeats until the
model answers with no tool call or the step budget is spent.

This is the dual-language twin of jengakit_agent.js; a parity test pins that the
two behave identically on a scripted LLM.
"""

import json
import re

USE_RE = re.compile(r'<use\s+name="([a-zA-Z0-9_\-]+)"\s*>([\s\S]*?)</use>')


def _tool_instructions(tools):
    if not tools:
        return ""
    lines = "\n".join(
        "- {}: {}{}".format(t["name"], t.get("description", ""), " (side-effecting)" if t.get("side_effecting") else "")
        for t in tools
    )
    return (
        "\n\n## Tools\nYou can use these tools:\n" + lines +
        '\n\nTo use a tool, output EXACTLY one tag and nothing after it:\n'
        '<use name="TOOLNAME">{"arg":"value"}</use>\n'
        "Then STOP — you will be given the result and can continue. "
        "When you have the final answer for the user, reply normally with NO <use> tag."
    )


class Agent:
    def __init__(self, system_prompt="You are a helpful assistant.", tools=None,
                 autonomy="auto", max_steps=6, llm=None):
        self.system_prompt = system_prompt or "You are a helpful assistant."
        self.tools = {t["name"]: t for t in (tools or [])}
        self.autonomy = autonomy or "auto"
        self.max_steps = max(1, max_steps or 6)
        self.llm = llm

    def _render(self, history, user, scratch):
        lines = []
        for m in (history or []):
            lines.append(("User" if m.get("role") == "user" else "Assistant") + ": " + str(m.get("content", "")))
        lines.append("User: " + user)
        lines.extend(scratch)
        lines.append("Assistant:")
        return "\n".join(lines)

    def run(self, user_text, history=None, on_event=None):
        on_event = on_event or (lambda *a, **k: None)
        tool_list = list(self.tools.values())
        system = self.system_prompt + _tool_instructions(tool_list)
        trace = []
        scratch = []

        for step in range(self.max_steps):
            prompt = self._render(history, user_text, scratch)
            try:
                out = self.llm(prompt, system) if self.llm else None
            except Exception as e:  # noqa: BLE001
                out = None
                trace.append({"type": "llm-error", "error": str(e)})
            if out is None:
                on_event("error", {"message": "LLM unavailable"})
                return {"text": "(the assistant is not configured with an LLM yet)", "trace": trace, "steps": step}

            m = USE_RE.search(out)
            if not m:
                on_event("answer", {"text": out})
                trace.append({"type": "answer", "text": out})
                return {"text": out.strip(), "trace": trace, "steps": step + 1}

            name = m.group(1)
            raw = (m.group(2) or "").strip()
            try:
                args = json.loads(raw or "{}")
            except Exception:  # noqa: BLE001
                args = {"_raw": raw}
            tool = self.tools.get(name)
            trace.append({"type": "tool-call", "name": name, "args": args})
            on_event("tool-call", {"name": name, "args": args})

            if not tool:
                scratch.append('<result name="' + name + '">unknown tool</result>')
                continue

            if tool.get("side_effecting") and self.autonomy == "readonly":
                note = "BLOCKED by read-only autonomy — would have run " + name + " with " + json.dumps(args)
                scratch.append('<result name="' + name + '">' + note + "</result>")
                trace.append({"type": "tool-blocked", "name": name})
                on_event("tool-blocked", {"name": name, "args": args})
                continue
            if tool.get("side_effecting") and self.autonomy == "supervised":
                on_event("tool-announce", {"name": name, "args": args})

            try:
                result = tool["run"](args or {})
            except Exception as e:  # noqa: BLE001
                result = "tool error: " + str(e)
            result = ("" if result is None else str(result))[:4000]
            scratch.append('<result name="' + name + '">' + result + "</result>")
            trace.append({"type": "tool-result", "name": name, "result": result})
            on_event("tool-result", {"name": name, "result": result})

        try:
            final = self.llm(self._render(history, user_text, scratch) +
                             "\n(Give your best final answer now, no tools.)", system) if self.llm else None
        except Exception:  # noqa: BLE001
            final = None
        trace.append({"type": "budget-exhausted"})
        return {"text": (final or "I reached my step limit before finishing.").strip(),
                "trace": trace, "steps": self.max_steps}


def parse_use(s):
    return USE_RE.search(s or "")
