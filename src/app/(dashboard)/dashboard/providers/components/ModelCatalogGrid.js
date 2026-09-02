"use client";

/**
 * @deprecated Use `ModelCatalogTable` (@tanstack/react-table) instead.
 * This flex/grid layout is kept for reference only and will be removed in a future release.
 */
import ModelCatalogTable from "./ModelCatalogTable";

export default function ModelCatalogGrid(props) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[ModelCatalogGrid] is deprecated. Import ModelCatalogTable instead.",
    );
  }
  const {
    renderPricingCell: _rp,
    renderStateBadge: _rs,
    renderRowActions: _ra,
    ...rest
  } = props;
  return <ModelCatalogTable {...rest} />;
}
