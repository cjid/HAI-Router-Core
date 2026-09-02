"use client";

import { useState, useEffect, useRef } from "react";
import { Card, Button } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";
import {
  resolveLogLevelFromLine,
  shouldSkipConsoleLine,
  stripCaptureTag,
} from "@/shared/utils/consoleLogLevel";
import { getLogLevelTextClass } from "@/shared/utils/statusSemantic";
import { isNearScrollBottom } from "@/shared/utils/scrollStick.js";

function colorLine(line) {
  const level = resolveLogLevelFromLine(line);
  const color = getLogLevelTextClass(level);
  const display = stripCaptureTag(line);
  return <span className={color}>{display}</span>;
}

function normalizeIncoming(lines) {
  return lines.filter((line) => !shouldSkipConsoleLine(line));
}

export default function ConsoleLogClient() {
  const [logs, setLogs] = useState([]);
  const logRef = useRef(null);
  const stickToBottomRef = useRef(true);

  const handleClear = async () => {
    try {
      await fetch("/api/translator/console-logs", { method: "DELETE" });
    } catch (err) {
      console.error("Failed to clear console logs:", err);
    }
  };

  useEffect(() => {
    const es = new EventSource("/api/translator/console-logs/stream");

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "init") {
        setLogs(normalizeIncoming(msg.logs).slice(-CONSOLE_LOG_CONFIG.maxLines));
      } else if (msg.type === "line") {
        if (shouldSkipConsoleLine(msg.line)) return;
        setLogs((prev) => {
          const next = [...prev, msg.line];
          return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
        });
      } else if (msg.type === "lines") {
        const fresh = normalizeIncoming(msg.lines);
        if (!fresh.length) return;
        setLogs((prev) => {
          const next = [...prev, ...fresh];
          return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
        });
      } else if (msg.type === "clear") {
        setLogs([]);
      }
    };

    es.onerror = () => {};

    return () => es.close();
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current || !logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const handleLogScroll = () => {
    stickToBottomRef.current = isNearScrollBottom(logRef.current);
  };

  return (
    <div className="">
      <Card>
        <div className="flex items-center justify-end px-4 pt-3 pb-2">
          <Button size="sm" variant="outline" icon="delete" onClick={handleClear}>
            Clear
          </Button>
        </div>
        <div
          ref={logRef}
          onScroll={handleLogScroll}
          className="bg-black rounded-b-lg p-4 text-xs font-mono leading-relaxed h-[calc(100vh-220px)] overflow-y-auto"
        >
          {logs.length === 0 ? (
            <span className="text-text-muted">No console logs yet.</span>
          ) : (
            <div className="space-y-0.5 whitespace-pre-wrap break-words">
              {logs.map((line, i) => (
                <div key={i}>{colorLine(line)}</div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
