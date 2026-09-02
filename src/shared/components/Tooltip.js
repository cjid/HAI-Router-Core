"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";

export default function Tooltip({ text, children, position = "top", color }) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const gap = 6;
    let top = 0;
    let left = rect.left + rect.width / 2;
    let transform = "translateX(-50%)";

    if (position === "top") {
      top = rect.top - gap;
      transform += " translateY(-100%)";
    } else if (position === "bottom") {
      top = rect.bottom + gap;
    } else if (position === "left") {
      top = rect.top + rect.height / 2;
      left = rect.left - gap;
      transform = "translate(-100%, -50%)";
    } else if (position === "right") {
      top = rect.top + rect.height / 2;
      left = rect.right + gap;
      transform = "translateY(-50%)";
    }

    setCoords({ top, left, transform });
  }, [position]);

  const show = () => {
    updatePosition();
    setVisible(true);
  };

  const hide = () => setVisible(false);

  useEffect(() => {
    if (!visible) return undefined;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [visible, updatePosition]);

  const bgStyle = color ? { backgroundColor: color } : {};
  const bgClass = color ? "" : "bg-gray-900 dark:bg-gray-800";

  const tooltipNode = visible && coords && typeof document !== "undefined"
    ? createPortal(
        <div
          role="tooltip"
          className={`pointer-events-none fixed z-[9999] w-max max-w-56 rounded px-2 py-1 text-[11px] leading-snug shadow-lg ${bgClass} text-white whitespace-normal`}
          style={{
            top: coords.top,
            left: coords.left,
            transform: coords.transform,
            ...bgStyle,
          }}
        >
          {text}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {tooltipNode}
    </>
  );
}

Tooltip.propTypes = {
  text: PropTypes.node.isRequired,
  children: PropTypes.node.isRequired,
  position: PropTypes.oneOf(["top", "bottom", "left", "right"]),
  color: PropTypes.string,
};
