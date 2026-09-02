"use client";

import PropTypes from "prop-types";
import MdiIcon from "@/shared/components/MdiIcon";
import Modal from "./Modal";
import FooterAttribution from "./FooterAttribution";
import {
  CREDITS_FOOTNOTE,
  CREDITS_INTRO,
  CREDITS_SECTIONS,
} from "@/shared/constants/credits";

function CreditLink({ href, label }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-hover"
    >
      <span>{label}</span>
      <MdiIcon name="open_in_new" size={12} className="opacity-70" />
    </a>
  );
}

CreditLink.propTypes = {
  href: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
};

function CreditsSection({ icon, title, description, people = [], links = [] }) {
  return (
    <section className="rounded-lg border border-border-subtle bg-surface-2/40 p-4 space-y-3">
      <div className="flex items-start gap-2.5">
        <MdiIcon name={icon} size={18} className="text-primary shrink-0 mt-0.5" />
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold text-text-main">{title}</h3>
          <p className="text-xs leading-relaxed text-text-muted">{description}</p>
        </div>
      </div>

      {people.length > 0 && (
        <ul className="space-y-1.5 pl-7">
          {people.map((person) => (
            <li key={`${person.name}-${person.role}`} className="text-xs text-text-main">
              {person.href ? (
                <a
                  href={person.href}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary hover:text-primary-hover"
                >
                  {person.name}
                </a>
              ) : (
                <span className="font-medium">{person.name}</span>
              )}
              <span className="text-text-muted"> · {person.role}</span>
            </li>
          ))}
        </ul>
      )}

      {links.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 pl-7">
          {links.map((link) => (
            <CreditLink key={link.href} href={link.href} label={link.label} />
          ))}
        </div>
      )}
    </section>
  );
}

CreditsSection.propTypes = {
  icon: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  people: PropTypes.array,
  links: PropTypes.array,
};

export default function CreditsModal({ isOpen, onClose }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Credits" size="lg">
      <div className="space-y-4 text-sm">
        <p className="text-xs leading-relaxed text-text-muted">{CREDITS_INTRO}</p>

        {CREDITS_SECTIONS.map((section) => {
          const { key, ...sectionProps } = section;
          return <CreditsSection key={key} {...sectionProps} />;
        })}

        <div className="rounded-lg border border-dashed border-border-subtle px-4 py-3 space-y-1.5">
          <p className="text-[11px] text-text-muted">{CREDITS_FOOTNOTE.license}</p>
          <p className="text-[11px] text-text-muted">
            <FooterAttribution linkClassName="text-primary hover:text-primary-hover" />
          </p>
        </div>
      </div>
    </Modal>
  );
}

CreditsModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
