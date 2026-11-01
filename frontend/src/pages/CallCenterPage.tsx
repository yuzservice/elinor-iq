import { useState } from "react";
import { AgentPanel } from "../features/calls/AgentPanel";
import { ProgramsPanel } from "../features/calls/ProgramsPanel";
import { ReportsPanel } from "../features/calls/ReportsPanel";
import { SettingsPanel } from "../features/calls/SettingsPanel";
import { UnderlineTab } from "../features/calls/ui";
import { useAuth } from "../hooks/useAuth";

const SECTIONS = [
  { key: "report", label: "گزارش" },
  { key: "programs", label: "برنامه‌های تماس" },
  { key: "settings", label: "تنظیمات عمومی" },
] as const;

export function CallCenterPage() {
  const { user } = useAuth();
  const [section, setSection] = useState<(typeof SECTIONS)[number]["key"]>("report");
  if (!user?.can_manage_calls) return <AgentPanel />;
  return (
    <div className="flex flex-col gap-[18px]">
      <nav aria-label="بخش‌های مدیر" className="flex flex-wrap items-center gap-[22px] border-b border-line">
        {SECTIONS.map((item) => (
          <UnderlineTab key={item.key} on={section === item.key} onClick={() => setSection(item.key)}>
            {item.label}
          </UnderlineTab>
        ))}
      </nav>
      {section === "report" ? <ReportsPanel /> : null}
      {section === "programs" ? <ProgramsPanel /> : null}
      {section === "settings" ? <SettingsPanel /> : null}
    </div>
  );
}
