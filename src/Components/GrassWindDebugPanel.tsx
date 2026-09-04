import React, { useMemo, useState } from 'react'
import {
   BLUSTERY_GRASS_WIND_SETTINGS,
   CALM_GRASS_WIND_SETTINGS,
   DEFAULT_GRASS_WIND_SETTINGS,
   type GrassWindSettings,
} from '../Environment/Grass'

type WindSettingKey = keyof GrassWindSettings

interface GrassWindDebugPanelProps {
   settings: GrassWindSettings
   visualizerEnabled: boolean
   visualizerHeight: number
   visualizerOpacity: number
   visualizerSize: number
   onChange: (settings: GrassWindSettings) => void
   onVisualizerEnabledChange: (enabled: boolean) => void
   onVisualizerHeightChange: (height: number) => void
   onVisualizerOpacityChange: (opacity: number) => void
   onVisualizerSizeChange: (size: number) => void
}

interface WindControl {
   key: WindSettingKey
   label: string
   min: number
   max: number
   step: number
}

// Grouped the way the wind model is built, because that is the only way these are tunable:
// turn the gusts off, get the breeze and the flutter reading right on their own, and only then
// bring the fronts back in on top.
const windControls: Array<{ title: string; controls: WindControl[] }> = [
   {
      title: 'Breeze',
      controls: [
         { key: 'breezeStrength', label: 'strength', min: 0, max: 0.6, step: 0.005 },
         { key: 'breezeSpeed', label: 'drift speed', min: 0, max: 14, step: 0.1 },
         { key: 'breezeScale', label: 'cell size', min: 0.001, max: 0.02, step: 0.0001 },
         { key: 'breezeVariation', label: 'patchiness', min: 0, max: 1, step: 0.01 },
      ],
   },
   {
      title: 'Flutter',
      controls: [
         { key: 'flutterStrength', label: 'strength', min: 0, max: 0.3, step: 0.005 },
         { key: 'flutterSpeed', label: 'rate', min: 0, max: 8, step: 0.05 },
      ],
   },
   {
      title: 'Gusts',
      controls: [
         { key: 'gustStrength', label: 'strength', min: 0, max: 1.6, step: 0.01 },
         { key: 'gustSpeed', label: 'travel speed', min: 0, max: 60, step: 0.5 },
         { key: 'gustScale', label: 'front size', min: 0.0004, max: 0.008, step: 0.0001 },
         { key: 'gustFrequency', label: 'how often', min: 0, max: 1, step: 0.01 },
         { key: 'gustSharpness', label: 'edge', min: 0, max: 1, step: 0.01 },
         { key: 'gustCrest', label: 'crest snap', min: 0, max: 2, step: 0.01 },
         { key: 'gustRebound', label: 'spring back', min: 0, max: 1.5, step: 0.01 },
         { key: 'gustLobing', label: 'front breakup', min: 0, max: 0.6, step: 0.01 },
      ],
   },
   {
      title: 'Blades',
      controls: [
         { key: 'bendDegrees', label: 'max bend', min: 0, max: 55, step: 0.5 },
         { key: 'directionDegrees', label: 'wind bearing', min: 0, max: 360, step: 1 },
         { key: 'directionVariance', label: 'veer', min: 0, max: 0.9, step: 0.01 },
         { key: 'responseMin', label: 'stiffness min', min: 0, max: 2, step: 0.01 },
         { key: 'responseMax', label: 'stiffness max', min: 0, max: 2, step: 0.01 },
         { key: 'clumpResponse', label: 'clump response', min: 0, max: 2, step: 0.01 },
      ],
   },
]

function formatValue(value: number, step: number) {
   if (step < 0.001) {
      return value.toFixed(4)
   }

   if (step < 0.01) {
      return value.toFixed(3)
   }

   if (step < 0.1) {
      return value.toFixed(2)
   }

   return value.toFixed(1)
}

const GrassWindDebugPanel: React.FC<GrassWindDebugPanelProps> = ({
   settings,
   visualizerEnabled,
   visualizerHeight,
   visualizerOpacity,
   visualizerSize,
   onChange,
   onVisualizerEnabledChange,
   onVisualizerHeightChange,
   onVisualizerOpacityChange,
   onVisualizerSizeChange,
}) => {
   const [open, setOpen] = useState(true)
   const [copied, setCopied] = useState(false)
   const settingsText = useMemo(() => JSON.stringify(settings, null, 3), [settings])

   const setValue = (key: WindSettingKey, value: number) => {
      onChange({ ...settings, [key]: value })
      setCopied(false)
   }

   const copySettings = async () => {
      try {
         await navigator.clipboard.writeText(settingsText)
         setCopied(true)
      } catch {
         setCopied(false)
      }
   }

   if (!open) {
      return (
         <button type="button" style={styles.closedButton} onClick={() => setOpen(true)}>
            Grass Wind
         </button>
      )
   }

   return (
      <aside style={styles.panel} aria-label="Grass wind debug controls">
         <div style={styles.header}>
            <strong>Grass Wind</strong>
            <button type="button" style={styles.closeButton} onClick={() => setOpen(false)}>
               Hide
            </button>
         </div>

         <div style={styles.actions}>
            <button type="button" style={styles.actionButton} onClick={() => onChange({ ...CALM_GRASS_WIND_SETTINGS })}>
               Calm
            </button>
            <button
               type="button"
               style={styles.actionButton}
               onClick={() => onChange({ ...DEFAULT_GRASS_WIND_SETTINGS })}
            >
               Default
            </button>
            <button
               type="button"
               style={styles.actionButton}
               onClick={() => onChange({ ...BLUSTERY_GRASS_WIND_SETTINGS })}
            >
               Blustery
            </button>
            <button type="button" style={styles.actionButton} onClick={copySettings}>
               {copied ? 'Copied' : 'Copy Values'}
            </button>
         </div>

         <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Visualizer</h2>
            <label style={styles.checkboxControl}>
               <input
                  type="checkbox"
                  checked={visualizerEnabled}
                  onChange={(event) => onVisualizerEnabledChange(event.target.checked)}
               />
               wave plane
            </label>
            <label style={styles.control}>
               <span style={styles.controlLabel}>size</span>
               <input
                  style={styles.range}
                  type="range"
                  min={120}
                  max={720}
                  step={10}
                  value={visualizerSize}
                  onChange={(event) => onVisualizerSizeChange(Number(event.target.value))}
               />
               <input
                  style={styles.numberInput}
                  type="number"
                  min={120}
                  max={720}
                  step={10}
                  value={visualizerSize.toFixed(0)}
                  onChange={(event) => onVisualizerSizeChange(Number(event.target.value) || 120)}
               />
            </label>
            <label style={styles.control}>
               <span style={styles.controlLabel}>height</span>
               <input
                  style={styles.range}
                  type="range"
                  min={2}
                  max={28}
                  step={0.5}
                  value={visualizerHeight}
                  onChange={(event) => onVisualizerHeightChange(Number(event.target.value))}
               />
               <input
                  style={styles.numberInput}
                  type="number"
                  min={2}
                  max={28}
                  step={0.5}
                  value={visualizerHeight.toFixed(1)}
                  onChange={(event) => onVisualizerHeightChange(Number(event.target.value) || 2)}
               />
            </label>
            <label style={styles.control}>
               <span style={styles.controlLabel}>opacity</span>
               <input
                  style={styles.range}
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.01}
                  value={visualizerOpacity}
                  onChange={(event) => onVisualizerOpacityChange(Number(event.target.value))}
               />
               <input
                  style={styles.numberInput}
                  type="number"
                  min={0.05}
                  max={1}
                  step={0.01}
                  value={visualizerOpacity.toFixed(2)}
                  onChange={(event) => onVisualizerOpacityChange(Number(event.target.value) || 0.05)}
               />
            </label>
         </section>

         {windControls.map(({ title, controls }) => (
            <section key={title} style={styles.section}>
               <h2 style={styles.sectionTitle}>{title}</h2>
               {controls.map((control) => (
                  <label key={control.key} style={styles.control}>
                     <span style={styles.controlLabel}>{control.label}</span>
                     <input
                        style={styles.range}
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        value={settings[control.key]}
                        onChange={(event) => setValue(control.key, Number(event.target.value))}
                     />
                     <input
                        style={styles.numberInput}
                        type="number"
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        value={formatValue(settings[control.key], control.step)}
                        onChange={(event) => setValue(control.key, Number(event.target.value) || 0)}
                     />
                  </label>
               ))}
            </section>
         ))}
      </aside>
   )
}

const styles: Record<string, React.CSSProperties> = {
   panel: {
      position: 'fixed',
      right: 12,
      top: 12,
      width: 380,
      maxHeight: 'calc(100vh - 24px)',
      overflowY: 'auto',
      zIndex: 1000,
      padding: 12,
      border: '1px solid rgba(191, 228, 255, 0.34)',
      borderRadius: 8,
      background: 'rgba(5, 11, 15, 0.9)',
      color: '#f2f9ff',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 12,
      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.32)',
      backdropFilter: 'blur(8px)',
   },
   closedButton: {
      position: 'fixed',
      right: 12,
      top: 12,
      zIndex: 1000,
      border: '1px solid rgba(191, 228, 255, 0.38)',
      borderRadius: 8,
      background: 'rgba(5, 11, 15, 0.9)',
      color: '#f2f9ff',
      padding: '8px 10px',
      cursor: 'pointer',
   },
   header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
   },
   closeButton: {
      border: '1px solid rgba(255, 255, 255, 0.18)',
      borderRadius: 6,
      background: 'rgba(255, 255, 255, 0.08)',
      color: '#f2f9ff',
      padding: '4px 7px',
      cursor: 'pointer',
      font: 'inherit',
   },
   actions: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 6,
      marginBottom: 10,
   },
   actionButton: {
      border: '1px solid rgba(191, 228, 255, 0.28)',
      borderRadius: 6,
      background: 'rgba(82, 141, 178, 0.2)',
      color: '#f2f9ff',
      cursor: 'pointer',
      font: 'inherit',
      padding: '6px 8px',
   },
   section: {
      borderTop: '1px solid rgba(255, 255, 255, 0.12)',
      paddingTop: 9,
      marginTop: 9,
   },
   sectionTitle: {
      margin: '0 0 8px',
      color: '#a9dfff',
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 0,
   },
   control: {
      display: 'grid',
      gridTemplateColumns: '110px 1fr 72px',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
   },
   controlLabel: {
      color: '#b9cbd7',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
   },
   checkboxControl: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      marginBottom: 7,
      color: '#b9cbd7',
   },
   range: {
      width: '100%',
   },
   numberInput: {
      width: '100%',
      boxSizing: 'border-box',
      border: '1px solid rgba(255, 255, 255, 0.18)',
      borderRadius: 6,
      background: 'rgba(0, 0, 0, 0.3)',
      color: '#f2f9ff',
      padding: '4px 5px',
      font: 'inherit',
   },
}

export default GrassWindDebugPanel
