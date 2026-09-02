"use client";

import PropTypes from "prop-types";
import Tooltip from "@/shared/components/Tooltip";
import { cn } from "@/shared/utils/cn";
import { getSemanticTextClass } from "@/shared/utils/statusSemantic";
import { INPUT_MODALITY_META, OUTPUT_MODALITY_META } from "@/shared/utils/modelCatalog";
import { TableMdi } from "@/shared/components/MdiIcon";
import {
  mdiBrain,
  mdiClose,
  mdiFileDocumentOutline,
  mdiHelpCircleOutline,
  mdiImageOutline,
  mdiMicrophoneOutline,
  mdiVideoOutline,
} from "@mdi/js";

const ICON_SLOT = "inline-flex h-5 w-5 shrink-0 items-center justify-center";
const COMPACT_ICON_SLOT = "inline-flex h-4 w-4 shrink-0 items-center justify-center";

export { TableMdi };

const MODALITY_VISUAL = {
  text: { label: "Text", kind: "letter", letter: "T", fg: "text-sky-400" },
  image: { label: "Image", kind: "mdi", path: mdiImageOutline, fg: "text-emerald-400" },
  audio: { label: "Audio", kind: "mdi", path: mdiMicrophoneOutline, fg: "text-amber-400" },
  video: { label: "Video", kind: "mdi", path: mdiVideoOutline, fg: "text-rose-400" },
  file: { label: "File", kind: "mdi", path: mdiFileDocumentOutline, fg: "text-yellow-500" },
};

function ModalityIcon({ modalityKey, direction, compact = false }) {
  const visual = MODALITY_VISUAL[modalityKey] || MODALITY_VISUAL.text;
  const meta = INPUT_MODALITY_META[modalityKey] || OUTPUT_MODALITY_META[modalityKey];
  const label = meta?.label || visual.label;
  const slot = compact ? COMPACT_ICON_SLOT : ICON_SLOT;

  return (
    <Tooltip text={`${direction}: ${label}`} position="bottom">
      <span className={slot} aria-label={`${direction} ${label}`}>
        {visual.kind === "letter" ? (
          <span className={cn(compact ? "text-[11px]" : "text-[13px]", "font-semibold leading-none", visual.fg)}>
            {visual.letter}
          </span>
        ) : (
          <TableMdi path={visual.path} size={compact ? 14 : 16} className={visual.fg} aria-hidden />
        )}
      </span>
    </Tooltip>
  );
}

ModalityIcon.propTypes = {
  modalityKey: PropTypes.string.isRequired,
  direction: PropTypes.string.isRequired,
  compact: PropTypes.bool,
};

/** Fixed-width IN/OUT label so modality icons align across rows */
const MODALITY_LABEL = "w-6 shrink-0 text-center text-[9px] font-semibold uppercase tracking-wide text-text-muted/60";

function ModalityRow({ tag, modalities, direction }) {
  if (!modalities?.length) return null;
  return (
    <div className="flex h-5 items-center gap-1.5">
      <span className={MODALITY_LABEL}>{tag}</span>
      <span className="inline-flex h-5 flex-nowrap items-center gap-1">
        {modalities.map((key) => (
          <ModalityIcon key={`${tag}-${key}`} modalityKey={key} direction={direction} />
        ))}
      </span>
    </div>
  );
}

ModalityRow.propTypes = {
  tag: PropTypes.string.isRequired,
  modalities: PropTypes.arrayOf(PropTypes.string),
  direction: PropTypes.string.isRequired,
};

export function CapabilitiesCell({ inputModalities, outputModalities }) {
  const inputs = inputModalities?.length ? inputModalities : [];
  const outputs = outputModalities?.length ? outputModalities : [];
  if (!inputs.length && !outputs.length) {
    return <span className="text-text-muted/50 text-[10px]">—</span>;
  }
  return (
    <div className="flex flex-col justify-center gap-1">
      <ModalityRow tag="IN" modalities={inputs} direction="Input" />
      <ModalityRow tag="OUT" modalities={outputs} direction="Output" />
    </div>
  );
}

CapabilitiesCell.propTypes = {
  inputModalities: PropTypes.arrayOf(PropTypes.string),
  outputModalities: PropTypes.arrayOf(PropTypes.string),
};

/** Single-line IN/OUT modality icons for compact pickers and combo rows */
export function CompactCapabilitiesInline({ inputModalities, outputModalities }) {
  const inputs = inputModalities?.length ? inputModalities : [];
  const outputs = outputModalities?.length ? outputModalities : [];
  if (!inputs.length && !outputs.length) {
    return <span className="text-text-muted/40 text-[10px] shrink-0">—</span>;
  }

  const renderGroup = (tag, modalities, direction) => {
    if (!modalities.length) return null;
    return (
      <span className="inline-flex items-center gap-0.5 shrink-0">
        <span className="w-5 text-center text-[9px] font-semibold uppercase tracking-wide text-text-muted/60">
          {tag}
        </span>
        <span className="inline-flex items-center gap-0.5">
          {modalities.map((key) => (
            <ModalityIcon key={`${tag}-${key}`} modalityKey={key} direction={direction} compact />
          ))}
        </span>
      </span>
    );
  };

  return (
    <div className="inline-flex items-center gap-2 shrink-0">
      {renderGroup("IN", inputs, "Input")}
      {renderGroup("OUT", outputs, "Output")}
    </div>
  );
}

CompactCapabilitiesInline.propTypes = {
  inputModalities: PropTypes.arrayOf(PropTypes.string),
  outputModalities: PropTypes.arrayOf(PropTypes.string),
};

export function ReasoningCell({ value, compact = false }) {
  const slot = compact ? COMPACT_ICON_SLOT : ICON_SLOT;
  if (value === "yes") {
    return (
      <Tooltip text="Supports reasoning" position="bottom">
        <span className={slot} aria-label="Supports reasoning">
          <TableMdi path={mdiBrain} size={compact ? 14 : 16} className={getSemanticTextClass("success")} />
        </span>
      </Tooltip>
    );
  }
  if (value === "no") {
    return (
      <Tooltip text="No reasoning support" position="bottom">
        <span className={slot} aria-label="No reasoning support">
          <TableMdi path={mdiClose} size={compact ? 14 : 16} className={getSemanticTextClass("error")} />
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip text="Reasoning capability unknown" position="bottom">
      <span className={slot} aria-label="Reasoning capability unknown">
        <TableMdi path={mdiHelpCircleOutline} size={compact ? 14 : 16} className="text-text-muted" />
      </span>
    </Tooltip>
  );
}

ReasoningCell.propTypes = {
  value: PropTypes.string,
  compact: PropTypes.bool,
};
