import React, { useState, useEffect } from 'react';
import { audioOutputManager } from '../lib/audio/audioOutputManager';
import { dockingDetector } from '../lib/audio/dockingDetector';
import { Smartphone, Speaker, Car, Bluetooth, Settings, Loader2 } from 'lucide-react';
import { getTranslation, linguaCorrente } from '../lib/i18n';

export function BluetoothAudioSelector() {
  const t = (key: string) => getTranslation(key, linguaCorrente());
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDevice, setCurrentDevice] = useState<string>('default');
  const [autoDetect, setAutoDetect] = useState(true);
  const [isDocked, setIsDocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAudio = async () => {
      const devs = await audioOutputManager.getAudioDevices();
      setDevices(devs);
      setCurrentDevice(audioOutputManager.getCurrentDeviceId());
      setAutoDetect(audioOutputManager.isAutoDetectEnabled());
      setIsDocked(dockingDetector.isDocked());
      setLoading(false);

      audioOutputManager.onDeviceChange((newDevs) => {
        setDevices(newDevs);
        setCurrentDevice(audioOutputManager.getCurrentDeviceId());
      });

      dockingDetector.onDockChange((docked) => {
        setIsDocked(docked);
      });
    };

    initAudio();
  }, []);

  const getDeviceIcon = (label: string) => {
    const l = label.toLowerCase();
    if (l.includes('bluetooth') || l.includes('a2dp')) return <Bluetooth className="w-5 h-5" />;
    if (l.includes('car') || l.includes('auto') || l.includes('handsfree')) return <Car className="w-5 h-5" />;
    if (l.includes('speaker')) return <Speaker className="w-5 h-5" />;
    return <Smartphone className="w-5 h-5" />;
  };

  const handleDeviceSelect = async (deviceId: string) => {
    await audioOutputManager.setOutputDevice(deviceId);
    setCurrentDevice(deviceId);
  };

  const handleToggleAutoDetect = () => {
    const next = !autoDetect;
    audioOutputManager.setAutoDetectEnabled(next);
    setAutoDetect(next);
  };

  const handleToggleDocking = () => {
    dockingDetector.setDocked(!isDocked);
  };

  if (loading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin text-[#1e3a8a]/40" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[2rem] p-6 border border-outline-variant/10 shadow-sm space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#1e3a8a]/5 flex items-center justify-center text-[#1e3a8a]">
          <Settings className="w-5 h-5" />
        </div>
        <h3 className="text-xl font-black text-[#1e3a8a]">{t('vr_b_bt_title')}</h3>
      </div>

      <div className="space-y-3">
        <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-widest pl-1">
          {t('vr_b_bt_output')}
        </label>
        <div className="space-y-2">
          {devices.length === 0 ? (
            <div className="p-4 bg-surface rounded-2xl text-sm font-bold text-on-surface-variant opacity-70">
              {t('vr_b_bt_none')}
            </div>
          ) : (
            devices.map((device) => (
              <button
                key={device.deviceId}
                onClick={() => handleDeviceSelect(device.deviceId)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                  currentDevice === device.deviceId
                    ? 'bg-secondary/10 border-secondary/30 text-[#1e3a8a]'
                    : 'bg-white border-outline-variant/10 hover:border-secondary/20 text-on-surface-variant'
                }`}
              >
                <div className={`p-2 rounded-xl ${currentDevice === device.deviceId ? 'bg-secondary text-white' : 'bg-surface'}`}>
                  {getDeviceIcon(device.label)}
                </div>
                <div className="flex-1 text-left">
                  <p className="font-bold text-sm truncate">
                    {device.label || t('vr_b_bt_default')}
                  </p>
                  {currentDevice === device.deviceId && (
                    <p className="text-[10px] font-black uppercase text-secondary tracking-widest mt-0.5">
                      {t('vr_b_bt_active')}
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="space-y-4 pt-2">
        <label className="flex items-center justify-between p-4 bg-surface rounded-2xl border border-outline-variant/10 cursor-pointer hover:bg-on-surface/5 transition-colors">
          <div>
            <p className="font-bold text-sm text-[#1e3a8a]">{t('vr_b_bt_auto')}</p>
            <p className="text-xs font-semibold text-on-surface-variant/70 mt-1">
              {t('vr_b_bt_auto_sub')}
            </p>
          </div>
          <div className={`w-12 h-7 rounded-full flex items-center px-1 transition-colors ${autoDetect ? 'bg-emerald-500' : 'bg-outline-variant/30'}`}>
            <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${autoDetect ? 'translate-x-5' : 'translate-x-0'}`} />
          </div>
        </label>

        <label className="flex items-center justify-between p-4 bg-surface rounded-2xl border border-outline-variant/10 cursor-pointer hover:bg-on-surface/5 transition-colors">
          <div>
            <p className="font-bold text-sm text-[#1e3a8a]">{t('vr_b_bt_dock')}</p>
            <p className="text-xs font-semibold text-on-surface-variant/70 mt-1">
              {t('vr_b_bt_dock_sub')}
            </p>
          </div>
          <div className={`w-12 h-7 rounded-full flex items-center px-1 transition-colors ${isDocked ? 'bg-emerald-500' : 'bg-outline-variant/30'}`}>
            <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${isDocked ? 'translate-x-5' : 'translate-x-0'}`} />
          </div>
        </label>
      </div>
    </div>
  );
}
