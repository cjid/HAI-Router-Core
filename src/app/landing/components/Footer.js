"use client";

import MdiIcon from "@/shared/components/MdiIcon";
import { APP_CONFIG, GITHUB_CONFIG } from "@/shared/constants/config";
import FooterAttribution from "@/shared/components/FooterAttribution";

export default function Footer() {
  return (
    <footer className="border-t border-[#3a2f27] bg-[#120f0d] pt-16 pb-8 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-16">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="size-6 rounded bg-[#f97815] flex items-center justify-center text-white">
                <MdiIcon name="hub" size={16} />
              </div>
              <h3 className="text-white text-lg font-bold">{APP_CONFIG.productName}</h3>
            </div>
            <p className="text-gray-500 text-sm max-w-xs mb-6">
              The unified endpoint for AI generation. Connect, route, and manage your AI providers with ease.
            </p>
            <div className="flex gap-4">
              <a className="text-gray-400 hover:text-white transition-colors" href={GITHUB_CONFIG.repoUrl} target="_blank" rel="noopener noreferrer">
                <MdiIcon name="code" size={18} />
              </a>
            </div>
          </div>
          
          {/* Product */}
          <div className="flex flex-col gap-4">
            <h4 className="font-bold text-white">Product</h4>
            <a className="text-gray-400 hover:text-[#f97815] text-sm transition-colors" href="#features">Features</a>
            <a className="text-gray-400 hover:text-[#f97815] text-sm transition-colors" href="/dashboard">Dashboard</a>
            <a className="text-gray-400 hover:text-[#f97815] text-sm transition-colors" href={`${GITHUB_CONFIG.repoUrl}/blob/master/CHANGELOG.md`} target="_blank" rel="noopener noreferrer">Changelog</a>
          </div>
          
          {/* Resources */}
          <div className="flex flex-col gap-4">
            <h4 className="font-bold text-white">Resources</h4>
            <a className="text-gray-400 hover:text-[#f97815] text-sm transition-colors" href={`${GITHUB_CONFIG.repoUrl}#readme`} target="_blank" rel="noopener noreferrer">Documentation</a>
            <a className="text-gray-400 hover:text-white text-sm transition-colors" href={GITHUB_CONFIG.repoUrl} target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
          
          {/* Legal */}
          <div className="flex flex-col gap-4">
            <h4 className="font-bold text-white">Legal</h4>
            <a className="text-gray-400 hover:text-[#f97815] text-sm transition-colors" href={`${GITHUB_CONFIG.repoUrl}/blob/master/LICENSE`} target="_blank" rel="noopener noreferrer">MIT License</a>
          </div>
        </div>
        
        {/* Bottom */}
        <div className="border-t border-[#3a2f27] pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-gray-600 text-sm">
            © 2025{" "}
            <FooterAttribution linkClassName="text-gray-500 hover:text-white" />
          </p>
          <div className="flex gap-6">
            <a className="text-gray-600 hover:text-white text-sm transition-colors" href={GITHUB_CONFIG.repoUrl} target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
