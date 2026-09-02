"use client";

import { useRef } from "react";
import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";
import ModelCatalogTable from "./ModelCatalogTable";

function ModelTablePanel({
  title,
  description,
  count,
  children,
  className,
  scrollRef,
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div>
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="text-xs text-text-muted">({count})</span>
        </div>
        {description ? (
          <p className="mt-0.5 text-[11px] text-text-muted">{description}</p>
        ) : null}
      </div>
      <div className="min-w-0 rounded-lg border border-black/5 dark:border-white/5">
        <div
          ref={scrollRef}
          className="max-h-[min(24rem,50vh)] w-full min-w-0 overflow-x-auto overflow-y-auto overscroll-x-contain overscroll-y-contain [-webkit-overflow-scrolling:touch]"
        >
          {children}
        </div>
      </div>
    </section>
  );
}

ModelTablePanel.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  count: PropTypes.number.isRequired,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  scrollRef: PropTypes.object,
};

export default ModelTablePanel;

export function ModelCatalogTablePanel({
  title,
  description,
  count,
  emptyMessage,
  tableProps,
}) {
  const scrollRef = useRef(null);
  return (
    <ModelTablePanel title={title} description={description} count={count} scrollRef={scrollRef}>
      <ModelCatalogTable scrollContainerRef={scrollRef} {...tableProps} emptyMessage={emptyMessage} />
    </ModelTablePanel>
  );
}

ModelCatalogTablePanel.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  count: PropTypes.number.isRequired,
  emptyMessage: PropTypes.string.isRequired,
  tableProps: PropTypes.object.isRequired,
};
