"use client";

import MdiIcon from "@/shared/components/MdiIcon";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Button, Modal } from "@/shared/components";
import { PROCESS_LABEL_PRESETS, PROCESS_STATE } from "@/shared/constants/buttonProcess";
import { useAsyncProcess } from "@/shared/hooks/useAsyncProcess";

function mapTestStatus(status) {
  if (status === "testing") return PROCESS_STATE.TESTING;
  if (status === "ok") return PROCESS_STATE.SUCCESS;
  if (status === "error") return PROCESS_STATE.ERROR;
  return PROCESS_STATE.IDLE;
}

export default function AddCustomModelModal({ isOpen, providerAlias, providerDisplayAlias, onSave, onClose }) {
  const [modelId, setModelId] = useState("");
  const [testStatus, setTestStatus] = useState(null);
  const [testError, setTestError] = useState("");
  const saveProcess = useAsyncProcess({ loadingState: PROCESS_STATE.SAVING, feedbackMs: 0 });
  const { reset: resetSaveProcess } = saveProcess;

  useEffect(() => {
    if (isOpen) {
      setModelId("");
      setTestStatus(null);
      setTestError("");
      resetSaveProcess();
    }
  }, [isOpen, resetSaveProcess]);

  const stripAlias = (id) => {
    const prefix = `${providerAlias}/`;
    return id.startsWith(prefix) ? id.slice(prefix.length) : id;
  };

  const handleTest = async () => {
    const cleanId = stripAlias(modelId.trim());
    if (!cleanId) return;
    setTestStatus("testing");
    setTestError("");
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: `${providerAlias}/${cleanId}` }),
      });
      const data = await res.json();
      setTestStatus(data.ok ? "ok" : "error");
      setTestError(data.error || "");
    } catch (err) {
      setTestStatus("error");
      setTestError(err.message);
    }
  };

  const handleSave = () => saveProcess.run(async () => {
    const cleanId = stripAlias(modelId.trim());
    if (!cleanId) return false;
    try {
      await onSave(cleanId);
      return true;
    } catch {
      return false;
    }
  });

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleTest();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Custom Model">
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-sm font-medium mb-1.5 block">Model ID</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={modelId}
              onChange={(e) => { setModelId(e.target.value); setTestStatus(null); setTestError(""); }}
              onKeyDown={handleKeyDown}
              placeholder="e.g. claude-opus-4-5"
              className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
              autoFocus
            />
            <Button
              variant="secondary"
              icon="science"
              processState={mapTestStatus(testStatus)}
              processLabels={PROCESS_LABEL_PRESETS.test}
              onClick={handleTest}
              disabled={!modelId.trim() || testStatus === "testing"}
            />
          </div>
          <p className="text-xs text-text-muted mt-1">
            Sent to provider as: <code className="font-mono bg-sidebar px-1 rounded">{stripAlias(modelId.trim()) || "model-id"}</code>
          </p>
        </div>

        {testStatus === "ok" && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <MdiIcon name="check_circle" size={16} />
            Model is reachable
          </div>
        )}
        {testStatus === "error" && (
          <div className="flex items-start gap-2 text-sm text-red-500">
            <MdiIcon name="cancel" size={16} className="shrink-0" />
            <span>{testError || "Model not reachable"}</span>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button onClick={onClose} variant="ghost" fullWidth size="sm">Cancel</Button>
          <Button
            onClick={handleSave}
            fullWidth
            size="sm"
            disabled={!modelId.trim()}
            processState={saveProcess.processState}
            processLabels={PROCESS_LABEL_PRESETS.addModel}
            icon="add"
          />
        </div>
      </div>
    </Modal>
  );
}

AddCustomModelModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  providerAlias: PropTypes.string.isRequired,
  providerDisplayAlias: PropTypes.string.isRequired,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
