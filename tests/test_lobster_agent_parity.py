"""Dual-language SDK parity: jengakit_agent.js and jengakit_agent.py must behave
identically on scripted LLMs.

The JS side runs through kits/lobster-v2/test/parity_harness.js (one process per
scenario, run from the kit directory); the Python side drives the imported Agent
through the SAME scenarios below. Each side is normalized to
{text, steps, calls, ran, blocked} and the two must match exactly. Skips where
node isn't on PATH unless KITS_REQUIRE_NODE=1.
"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import unittest

from tests._node import KITS_DIR, require_node

_KIT = os.path.join(KITS_DIR, "lobster-v2")
_HARNESS = os.path.join("test", "parity_harness.js")
_AGENT_PY = os.path.join(_KIT, "templates", "lib", "jengakit_agent.py")
_SCENARIOS = ["tool_then_answer", "readonly_block", "budget", "no_llm", "unknown_tool"]


def _load_agent_module():
    spec = importlib.util.spec_from_file_location("jengakit_agent", _AGENT_PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _scripted(outs):
    state = {"i": 0}

    def fn(_prompt, _system):
        i = state["i"]
        state["i"] = i + 1
        return outs[i] if i < len(outs) else outs[-1]

    return fn


def _py_scenarios(Agent):
    """The SAME scenarios as parity_harness.js, built for the Python Agent."""
    return {
        "tool_then_answer": Agent(
            system_prompt="t",
            autonomy="auto",
            max_steps=6,
            llm=_scripted(['<use name="echo">{"x":"hi"}</use>', "done: hi"]),
            tools=[{"name": "echo", "description": "e", "side_effecting": True, "run": lambda a: "HI"}],
        ),
        "readonly_block": Agent(
            system_prompt="t",
            autonomy="readonly",
            max_steps=6,
            llm=_scripted(['<use name="rm">{"p":"/"}</use>', "stopped"]),
            tools=[{"name": "rm", "description": "danger", "side_effecting": True, "run": lambda a: "ran"}],
        ),
        "budget": Agent(
            system_prompt="t",
            autonomy="auto",
            max_steps=3,
            llm=_scripted(['<use name="noop">{}</use>']),
            tools=[{"name": "noop", "description": "n", "run": lambda a: "ok"}],
        ),
        "no_llm": Agent(system_prompt="t", autonomy="auto", max_steps=6, llm=lambda p, s: None, tools=[]),
        "unknown_tool": Agent(
            system_prompt="t",
            autonomy="auto",
            max_steps=6,
            llm=_scripted(['<use name="ghost">{}</use>', "ok"]),
            tools=[{"name": "present", "description": "p", "run": lambda a: "x"}],
        ),
    }


def _user_text(scenario):
    return {
        "tool_then_answer": "go",
        "readonly_block": "delete everything",
        "budget": "loop",
        "no_llm": "hi",
        "unknown_tool": "go",
    }[scenario]


def _summarize(result):
    trace = result["trace"]
    return {
        "text": result["text"],
        "steps": result["steps"],
        "calls": [t["name"] for t in trace if t["type"] == "tool-call"],
        "ran": [t["name"] for t in trace if t["type"] == "tool-result"],
        "blocked": [t["name"] for t in trace if t["type"] == "tool-blocked"],
    }


@require_node
class AgentParityTests(unittest.TestCase):
    def test_js_and_py_agents_agree(self):
        Agent = _load_agent_module().Agent
        py_agents = _py_scenarios(Agent)
        for scenario in _SCENARIOS:
            js = subprocess.run(
                ["node", _HARNESS, scenario], cwd=_KIT, capture_output=True, text=True, timeout=30
            )
            self.assertEqual(js.returncode, 0, f"JS harness failed for {scenario}:\n{js.stderr}")
            js_summary = json.loads(js.stdout)
            py_summary = _summarize(py_agents[scenario].run(_user_text(scenario), []))
            self.assertEqual(js_summary, py_summary, f"parity mismatch in scenario '{scenario}'")


if __name__ == "__main__":
    unittest.main()
