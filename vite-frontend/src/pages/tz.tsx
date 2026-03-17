import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/shadcn-bridge/heroui/button";
import { Progress } from "@/shadcn-bridge/heroui/progress";
import { BrandLogo } from "@/components/brand-logo";
import { getAdminFlag } from "@/utils/session";
import { getNodeList } from "@/api";
import { buildNodeSystemInfo } from "@/pages/node/system-info";
import { useNodeOfflineTimers } from "@/pages/node/use-node-offline-timers";
import { useNodeRealtime } from "@/pages/node/use-node-realtime";

interface Node {
  id: number;
  name: string;
  serverIp: string;
  serverIpV4?: string;
  serverIpV6?: string;
  status: number;
  isRemote?: number;
  connectionStatus: "online" | "offline";
  systemInfo?: {
    cpuUsage: number;
    memoryUsage: number;
    uploadTraffic: number;
    downloadTraffic: number;
    uploadSpeed: number;
    downloadSpeed: number;
    uptime: number;
  } | null;
}

const formatSpeed = (bytesPerSecond: number): string => {
  if (!bytesPerSecond || bytesPerSecond === 0) return "0 B/s";
  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
  return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const formatUptime = (seconds: number): string => {
  if (!seconds || seconds === 0) return "-";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}天${hours}小时`;
  if (hours > 0) return `${hours}小时${minutes}分钟`;
  return `${minutes}分钟`;
};

const formatTraffic = (bytes: number): string => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const getProgressColor = (value: number, offline = false) => {
  if (offline) return "default";
  if (value <= 50) return "success";
  if (value <= 80) return "warning";
  return "danger";
};

export default function TzPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [showIp, setShowIp] = useState(true); // 控制是否显示 IP 列
  const [loading, setLoading] = useState(true);
  const [nodeList, setNodeList] = useState<Node[]>([]);

  // 1. 初始化权限与视角偏好
  useEffect(() => {
    const adminFlag = getAdminFlag();
    setIsAdmin(adminFlag);
    
    if (adminFlag) {
      // 管理员可以读取上次的视角设置
      const savedPref = localStorage.getItem("tz_show_ip");
      if (savedPref !== null) {
        setShowIp(savedPref === "true");
      }
    } else {
      // 普通用户强制不显示 IP
      setShowIp(false);
    }
  }, []);

  // 切换视角函数
  const toggleView = () => {
    if (!isAdmin) return; // 二次防护，普通用户点不了
    const nextState = !showIp;
    setShowIp(nextState);
    localStorage.setItem("tz_show_ip", String(nextState));
  };

  // 2. 加载真实节点数据
  const loadNodes = useCallback(async () => {
    try {
      const res = await getNodeList();
      if (res.code === 0) {
        const nodesData = (res.data || [])
          .filter((node: any) => node.isRemote !== 1)
          .map((node: any) => ({
            ...node,
            connectionStatus: node.status === 1 ? "online" : "offline",
            systemInfo: null,
          }));
        setNodeList(nodesData);
      }
    } catch (error) {
      console.error("加载探针节点失败", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNodes();
  }, [loadNodes]);

  // 3. WebSocket 实时推送逻辑
  const handleNodeOffline = useCallback((nodeId: number) => {
    setNodeList((prev) =>
      prev.map((node) => {
        if (node.id !== nodeId) return node;
        return { ...node, connectionStatus: "offline", systemInfo: null };
      })
    );
  }, []);

  const { clearOfflineTimer, scheduleNodeOffline } = useNodeOfflineTimers({
    delayMs: 3000,
    onNodeOffline: handleNodeOffline,
  });

  const handleWebSocketMessage = (data: any) => {
    const { id, type, data: messageData } = data;
    const nodeId = Number(id);
    if (Number.isNaN(nodeId)) return;

    if (type === "status") {
      if (messageData === 1) {
        clearOfflineTimer(nodeId);
        setNodeList((prev) =>
          prev.map((node) =>
            node.id === nodeId ? { ...node, connectionStatus: "online" } : node
          )
        );
      } else {
        scheduleNodeOffline(nodeId);
      }
    } else if (type === "info") {
      clearOfflineTimer(nodeId);
      setNodeList((prev) =>
        prev.map((node) => {
          if (node.id === nodeId) {
            const systemInfo = buildNodeSystemInfo(messageData, node.systemInfo);
            if (!systemInfo) return node;
            return { ...node, connectionStatus: "online", systemInfo };
          }
          return node;
        })
      );
    }
  };

  const { wsConnected } = useNodeRealtime({ onMessage: handleWebSocketMessage });

  const renderListView = () => {
    return (
      <div className="bg-white dark:bg-content1 rounded-xl shadow-sm border border-divider overflow-hidden transition-all duration-300">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-default-500 bg-default-50/50 border-b border-divider transition-all duration-300">
              <tr>
                <th className="px-4 py-4 font-medium text-center w-16">状态</th>
                <th className="px-4 py-4 font-medium">节点名称</th>
                {/* 🔒 视角切换控制 */}
                {isAdmin && showIp && <th className="px-4 py-4 font-medium transition-all duration-300">出口 IP</th>}
                <th className="px-4 py-4 font-medium">实时速率</th>
                <th className="px-4 py-4 font-medium">运行时间</th>
                <th className="px-4 py-4 font-medium">累计流量</th>
                <th className="px-4 py-4 font-medium w-48">CPU 负载</th>
                <th className="px-4 py-4 font-medium w-48">内存占用</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {nodeList.map((node) => {
                const isOnline = node.connectionStatus === "online";
                const sys = node.systemInfo;

                return (
                  <tr key={node.id} className="hover:bg-default-50/30 transition-colors">
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block h-3 w-3 rounded-full ${
                          isOnline ? "bg-success shadow-[0_0_8px_rgba(23,201,100,0.8)] animate-pulse" : "bg-default-300"
                        }`}
                      ></span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {node.name}
                    </td>
                    
                    {/* 🔒 视角切换控制：显示堆叠 IP */}
                    {isAdmin && showIp && (
                      <td className="px-4 py-3 font-mono text-xs text-default-600 transition-all duration-300">
                        <div className="flex flex-col gap-0.5">
                          {node.serverIpV4 && <span>{node.serverIpV4}</span>}
                          {node.serverIpV6 && <span>{node.serverIpV6}</span>}
                          {!node.serverIpV4 && !node.serverIpV6 && node.serverIp && <span>{node.serverIp}</span>}
                          {!node.serverIpV4 && !node.serverIpV6 && !node.serverIp && <span>-</span>}
                        </div>
                      </td>
                    )}

                    <td className="px-4 py-3 font-mono text-xs">
                      <div className="text-success">{isOnline && sys ? `↓ ${formatSpeed(sys.downloadSpeed)}` : "-"}</div>
                      <div className="text-primary">{isOnline && sys ? `↑ ${formatSpeed(sys.uploadSpeed)}` : "-"}</div>
                    </td>
                    <td className="px-4 py-3 text-default-700 text-xs">
                      {isOnline && sys ? formatUptime(sys.uptime) : "离线"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <div className="text-default-700">{isOnline && sys ? `↓ ${formatTraffic(sys.downloadTraffic)}` : "-"}</div>
                      <div className="text-default-500">{isOnline && sys ? `↑ ${formatTraffic(sys.uploadTraffic)}` : "-"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Progress 
                          size="sm" 
                          value={isOnline && sys ? sys.cpuUsage : 0} 
                          color={getProgressColor(isOnline && sys ? sys.cpuUsage : 0, !isOnline)} 
                          className="flex-1"
                        />
                        <span className="text-xs font-mono w-10 text-right">
                          {isOnline && sys ? `${sys.cpuUsage.toFixed(1)}%` : "-"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Progress 
                          size="sm" 
                          value={isOnline && sys ? sys.memoryUsage : 0} 
                          color={getProgressColor(isOnline && sys ? sys.memoryUsage : 0, !isOnline)} 
                          className="flex-1"
                        />
                        <span className="text-xs font-mono w-10 text-right">
                          {isOnline && sys ? `${sys.memoryUsage.toFixed(1)}%` : "-"}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] text-foreground font-sans">
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-divider bg-white/70 px-6 backdrop-blur-md dark:bg-black/70">
        <div className="flex items-center gap-3">
          <BrandLogo size={28} />
          <a 
            href="/" 
            className="text-lg font-bold tracking-tight text-foreground hover:text-primary transition-colors cursor-pointer"
            title="返回主页"
          >
            主页
          </a>
          <div className={`ml-2 flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${wsConnected ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${wsConnected ? "bg-success animate-ping" : "bg-warning"}`}></span>
              <span className={`relative inline-flex h-2 w-2 rounded-full ${wsConnected ? "bg-success" : "bg-warning"}`}></span>
            </span>
            {wsConnected ? "实时数据已连接" : "正在连接..."}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {isAdmin && (
            <Button 
              variant="light" 
              className="text-default-600 font-medium" 
              size="sm" 
              onPress={toggleView}
            >
              切换视角
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] p-4 lg:p-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-default-400">正在同步节点数据...</div>
        ) : nodeList.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-default-400">暂无节点数据</div>
        ) : (
          renderListView()
        )}
      </main>
    </div>
  );
}
