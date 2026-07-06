import type { Metadata } from "next";
import Link from "next/link";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import "./globals.css";

export const metadata: Metadata = {
  title: "运单 V3 | 全流程管理",
  description: "扫描品控、异常上报、分级审批与执行联动",
};

const nav = [
  { href: "/", label: "总览" },
  { href: "/scan", label: "扫描品控" },
  { href: "/tickets", label: "异常工单" },
  { href: "/rules", label: "规则配置" },
  { href: "/access", label: "权限角色" },
  { href: "/inventory", label: "库存锁定" },
  { href: "/monitor", label: "接口监控" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>
          <div className="shell">
            <aside className="sidebar">
              <div className="brand">
                <div className="brand-mark">鲸</div>
                <div>
                  <div className="brand-title">运单 V3</div>
                  <div className="brand-sub">全生命周期管理</div>
                </div>
              </div>
              <nav className="nav">
                {nav.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
              </nav>
            </aside>
            <div className="main">
              <header className="topbar">
                <strong>扫描品控 → 异常上报 → 分级审批 → 执行联动</strong>
                <span className="tag">V2 API 隔离</span>
              </header>
              <main className="content">{children}</main>
            </div>
          </div>
        </AntdRegistry>
      </body>
    </html>
  );
}
