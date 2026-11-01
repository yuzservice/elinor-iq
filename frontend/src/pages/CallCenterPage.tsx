import { useNavigate, useSearchParams } from "react-router-dom";
import { parseCallsUrl, type CallSection } from "../features/calls/callsUrl";
import { AgentPanel } from "../features/calls/AgentPanel";
import { ProgramsPanel } from "../features/calls/ProgramsPanel";
import { ReportsPanel } from "../features/calls/ReportsPanel";
import { SettingsPanel } from "../features/calls/SettingsPanel";
import { UnderlineTab } from "../features/calls/ui";
import { useAuth } from "../hooks/useAuth";

const SECTION_ITEMS: { key: CallSection; label: string }[] = [
  { key: "report", label: "گزارش" },
  { key: "programs", label: "برنامه‌های تماس" },
  { key: "settings", label: "تنظیمات عمومی" },
];

export function CallCenterPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  if (!user?.can_manage_calls) return <AgentPanel />;
  const { section } = parseCallsUrl(params);
  return (
    <div className="flex flex-col gap-[18px]">
      <nav aria-label="بخش‌های مدیر" className="flex flex-wrap items-center gap-[22px] border-b border-line">
        {SECTION_ITEMS.map((item) => (
          <UnderlineTab key={item.key} on={section === item.key} onClick={() => navigate(`/calls?section=${item.key}`)}>
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
