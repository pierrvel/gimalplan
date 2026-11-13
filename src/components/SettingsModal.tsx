import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, LogIn, LogOut, RotateCcw } from 'lucide-react';
import { usePlanner } from '../context/PlannerContext';
import { DEFAULT_GEMINI_MODEL, GEMINI_MODEL_PRESETS } from '../services/storage';
import { NativeDialog } from './NativeDialog';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const {
    user,
    syncStatus,
    syncError,
    firebaseEnabled,
    geminiApiKey,
    geminiModel,
    setGeminiSettings,
    loginWithGoogle,
    logoutGoogle,
    resetToPresets,
  } = usePlanner();

  const [apiKeyInput, setApiKeyInput] = useState(geminiApiKey);
  const [showKey, setShowKey] = useState(false);
  const [modelPreset, setModelPreset] = useState<string>(DEFAULT_GEMINI_MODEL);
  const [customModelId, setCustomModelId] = useState('');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!open) return;
    setApiKeyInput(geminiApiKey);
    setShowKey(false);
    setSavedNotice(null);
    setAuthError(null);
    setConfirmReset(false);

    const isPreset = GEMINI_MODEL_PRESETS.some((p) => p.id === geminiModel);
    if (isPreset) {
      setModelPreset(geminiModel);
      setCustomModelId('');
    } else {
      setModelPreset('custom');
      setCustomModelId(geminiModel);
    }
  }, [open, geminiApiKey, geminiModel]);

  const handleSaveAiConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedModel =
      modelPreset === 'custom'
        ? customModelId.trim() || DEFAULT_GEMINI_MODEL
        : modelPreset;
    setGeminiSettings(apiKeyInput, resolvedModel);
    setSavedNotice('Gemini API 설정이 이 기기(localStorage)에 저장되었습니다.');
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      await loginWithGoogle();
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : '로그인 중 오류가 발생했습니다.');
    }
  };

  const handleGoogleLogout = async () => {
    setAuthError(null);
    await logoutGoogle();
  };

  return (
    <NativeDialog open={open} onClose={onClose} title="설정 및 계정 동기화" maxWidthClass="w-full max-w-lg">
      <div className="space-y-5">
        {/* Gemini AI Section */}
        <form onSubmit={handleSaveAiConfig} className="space-y-3 border-b border-zinc-200 pb-5">
          <h3 className="text-xs font-semibold text-zinc-900">Gemini AI 스케줄러 설정</h3>

          <div>
            <label htmlFor="gemini-api-key" className="mb-1 block text-xs font-medium text-zinc-700">
              개인 Gemini API Key 덮어쓰기 (선택 · 미입력 시 서버 보안 키 사용)
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id="gemini-api-key"
                name="geminiApiKey"
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                value={apiKeyInput}
                onChange={(e) => {
                  setApiKeyInput(e.target.value);
                  setSavedNotice(null);
                }}
                placeholder="비워두면 서버에 보안 저장된 API 키를 사용합니다"
                className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900"
              />
              <button
                type="button"
                aria-pressed={showKey}
                aria-label={showKey ? 'API 키 숨기기' : 'API 키 표시'}
                onClick={() => setShowKey((v) => !v)}
                className="touch-target inline-flex cursor-pointer items-center justify-center rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-zinc-600 hover:bg-slate-50"
              >
                {showKey ? (
                  <EyeOff size={15} strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <Eye size={15} strokeWidth={1.5} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="gemini-model-select" className="mb-1 block text-xs font-medium text-zinc-700">
              모델 선택 (기본값: Gemini 4 시리즈)
            </label>
            <select
              id="gemini-model-select"
              value={modelPreset}
              onChange={(e) => {
                setModelPreset(e.target.value);
                setSavedNotice(null);
              }}
              className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-900"
            >
              {GEMINI_MODEL_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">직접 모델 ID 입력</option>
            </select>
          </div>

          {modelPreset === 'custom' && (
            <div>
              <label htmlFor="gemini-custom-model" className="mb-1 block text-xs font-medium text-zinc-700">
                사용자 지정 모델 ID
              </label>
              <input
                id="gemini-custom-model"
                type="text"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                value={customModelId}
                onChange={(e) => {
                  setCustomModelId(e.target.value);
                  setSavedNotice(null);
                }}
                placeholder="예: gemini-4-argon"
                className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900"
              />
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs text-blue-700">{savedNotice ?? ''}</span>
            <button
              type="submit"
              className="touch-target cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              AI 설정 저장
            </button>
          </div>
        </form>

        {/* Firebase Sync Section */}
        <div className="space-y-2.5 border-b border-zinc-200 pb-5">
          <h3 className="text-xs font-semibold text-zinc-900">멀티 디바이스 Google 동기화</h3>

          {!firebaseEnabled ? (
            <p className="rounded-md border border-zinc-200 bg-slate-50 px-3 py-2 text-xs text-zinc-600">
              Firebase 환경 변수(VITE_FIREBASE_*)가 설정되지 않아 현재 로컬 저장소(localStorage) 전용 모드로 동작하고 있습니다.
            </p>
          ) : user ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-slate-50 px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-zinc-900">
                  {user.displayName ?? user.email}
                </div>
                <div className="truncate text-[11px] text-zinc-500">
                  {user.email} · 상태: {syncStatus === 'synced' ? '실시간 동기화 중' : syncStatus}
                </div>
              </div>
              <button
                type="button"
                onClick={handleGoogleLogout}
                className="touch-target inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
              >
                <LogOut size={13} strokeWidth={1.5} aria-hidden="true" />
                <span>로그아웃</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-slate-50 px-3 py-2.5">
              <span className="text-xs text-zinc-600">
                로그인하면 기존 로컬 데이터와 클라우드 데이터를 병합해 PC·태블릿·모바일에서 실시간 동기화합니다.
              </span>
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="touch-target inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
              >
                <LogIn size={13} strokeWidth={1.5} aria-hidden="true" />
                <span>Google 로그인</span>
              </button>
            </div>
          )}

          {(authError || syncError) && (
            <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {authError ?? syncError}
            </p>
          )}
        </div>

        {/* Preset Reset Section */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-zinc-900">데이터 초기화</h3>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-zinc-600">
              시험 시간표, 초기 시험범위, 주간·직전보강 프리셋을 처음 상태로 복원합니다.
            </span>

            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="touch-target inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-slate-50"
              >
                <RotateCcw size={13} strokeWidth={1.5} aria-hidden="true" />
                <span>프리셋 초기화</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="touch-target cursor-pointer rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-600"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetToPresets();
                    setConfirmReset(false);
                    setSavedNotice('초기 프리셋 데이터로 복원되었습니다.');
                  }}
                  className="touch-target cursor-pointer rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                >
                  초기화 확정
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </NativeDialog>
  );
};
