/**
 * PostHelperView - Divide un texto en posts que caben en X y los publica con el perfil elegido
 */

import React, { useState, useMemo, useRef } from 'react';
import { Copy, CopySuccess, Send, UserCircle, Pen2, ChatRoundDots, ChevronDown, Reply, QuoteUp, Eye, ImagePlus, X } from 'reicon-react';
import type { BrowserProfile, ProfileFolder } from '@xpm/core';
import { usePlatformAPI, useCapabilities } from '../hooks/usePlatformAPI';
import { COUNTER_TOKEN, DEFAULT_MARKER, MARKER_PAIRS, autoPairMarker, DEFAULT_POST_LIMIT, DEFAULT_SEPARATOR, postLength, splitIntoPosts } from '../postSplitter';
import { clearStyles, styleTyped, toggleStyle, type StyleFlag } from '../textStyles';
import Sidebar from './Sidebar';
import ProfileCombobox from './ProfileCombobox';
import PostPreviewModal from './PostPreviewModal';
import ProfileModal from './ProfileModal';
import CreateFolderModal from './CreateFolderModal';
import EditFolderModal from './EditFolderModal';
import './PostHelperView.css';
import './ProfilesPanel.css';

interface PostHelperViewProps {
  folders: ProfileFolder[];
  profiles: BrowserProfile[];
  selectedFolderId: string | null | 'ungrouped';
  onSelectFolder: (folderId: string | null | 'ungrouped') => void;
  expandedFolders: Set<string>;
  onToggleFolder: (folderId: string) => void;
  expandedOthers: boolean;
  onToggleOthers: () => void;
  onGoToDashboard?: () => void;
  onGoToSettings?: () => void;
  onGoToFolders?: () => void;
  onGoToCharacterHub?: () => void;
  onGoToPasswordManager?: () => void;
  onGoToMailManager?: () => void;
  activeStatuses?: Map<string, boolean>;
  showPasswordManager?: boolean;
  showMailManager?: boolean;
  showCharacterHub?: boolean;
  showFreedcamp?: boolean;
  showDashboard?: boolean;
  onToggleAllFolders?: (expand: boolean) => void;
  onFoldersChange?: () => void;
}

/** Hilo: dos posts unidos por una línea vertical */
const ThreadIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="6" cy="5.5" r="2.5" />
    <circle cx="6" cy="18.5" r="2.5" />
    <path d="M6 8v8" />
    <path d="M12 5.5h9" />
    <path d="M12 18.5h9" />
  </svg>
);

/** Id del tweet a partir de un enlace (x.com o twitter.com) o de un id suelto. null si no es válido. */
function parseTweetId(input: string): string | null {
  const value = input.trim();
  if (/^\d{5,25}$/.test(value)) return value;
  const match = value.match(/(?:x|twitter)\.com\/[^/?#]+\/status(?:es)?\/(\d+)/i) || value.match(/(?:x|twitter)\.com\/i\/(?:web\/)?status\/(\d+)/i);
  return match ? match[1] : null;
}

/** X admite hasta 4 imágenes por post */
const MAX_IMAGES = 4;

interface AttachedImage {
  id: string;
  name: string;
  mime: string;
  dataUrl: string;
}

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40];
const DEFAULT_FONT_SIZE = 14;
const FONT_SIZE_KEY = 'postHelperFontSize';

const STYLE_BUTTONS: Array<{ flag: StyleFlag | 'clear'; label: string; title: string; divider?: boolean }> = [
  { flag: 'bold', label: 'B', title: 'Bold' },
  { flag: 'italic', label: 'I', title: 'Italic (combine with Bold for bold italic)' },
  { flag: 'underline', label: 'U', title: 'Underline' },
  { flag: 'strike', label: 'S', title: 'Strikethrough' },
  { flag: 'monospace', label: 'M', title: 'Monospace' },
  { flag: 'clear', label: 'Clear', title: 'Remove styles', divider: true },
];

export default function PostHelperView({
  folders,
  profiles,
  selectedFolderId,
  onSelectFolder,
  expandedFolders,
  onToggleFolder,
  expandedOthers,
  onToggleOthers,
  onGoToDashboard,
  onGoToSettings,
  onGoToFolders,
  onGoToCharacterHub,
  onGoToPasswordManager,
  onGoToMailManager,
  activeStatuses = new Map(),
  showPasswordManager = false,
  showMailManager = false,
  showCharacterHub = false,
  showFreedcamp = false,
  showDashboard = true,
  onToggleAllFolders,
  onFoldersChange,
}: PostHelperViewProps) {
  const platformAPI = usePlatformAPI();
  const capabilities = useCapabilities();
  const [threadBusy, setThreadBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [postsHidden, setPostsHidden] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  // Ayuda de Separator / Marker: en el móvil no hay "pasar el ratón", así que se muestra al tocar el signo ?
  const [helpOpen, setHelpOpen] = useState<'separator' | 'marker' | null>(null);
  // Imágenes del primer post (solo donde se puede automatizar el compositor de X)
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [imageNote, setImageNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'new' | 'reply' | 'quote'>('new');
  // Enlace del post al que se responde o que se cita
  const [targetLink, setTargetLink] = useState('');
  // Solo cambia lo que se ve al escribir (ayuda para la vista), no el contenido de los posts
  const [fontSize, setFontSize] = useState(() => {
    const saved = parseInt(localStorage.getItem(FONT_SIZE_KEY) ?? '', 10);
    return FONT_SIZES.includes(saved) ? saved : DEFAULT_FONT_SIZE;
  });
  // Estilos activos para lo que se escriba cuando no hay texto seleccionado
  const [activeStyles, setActiveStyles] = useState<ReadonlySet<StyleFlag>>(new Set());

  const [text, setText] = useState('');
  const [separator, setSeparator] = useState(DEFAULT_SEPARATOR);
  const [limit, setLimit] = useState(DEFAULT_POST_LIMIT);
  const [marker, setMarker] = useState(DEFAULT_MARKER);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [doneIndexes, setDoneIndexes] = useState<Set<number>>(new Set());
  const [postError, setPostErrorState] = useState<{ summary: string; details?: string } | null>(null);
  const [errorExpanded, setErrorExpanded] = useState(false);
  // Cada error nuevo sale contraído: solo el resumen; el detalle técnico se despliega a demanda
  const setPostError = (error: { summary: string; details?: string } | null) => {
    setPostErrorState(error);
    setErrorExpanded(false);
  };

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalFolderId, setCreateModalFolderId] = useState<string | undefined>(undefined);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [profileForEdit, setProfileForEdit] = useState<BrowserProfile | null>(null);
  const [editingFolder, setEditingFolder] = useState<ProfileFolder | null>(null);

  const isReply = mode === 'reply';
  const isQuote = mode === 'quote';
  // Respuesta y cita apuntan a otro post: solo se publica el primero y no hay hilo
  const hasTarget = isReply || isQuote;

  const baseLimit = Number.isFinite(limit) && limit >= 20 ? limit : DEFAULT_POST_LIMIT;
  // Sin cita automática (p. ej. Android) el enlace va dentro del texto: ocupa 23 caracteres más un espacio
  const safeLimit = isQuote && !capabilities.postQuote ? Math.max(20, baseLimit - 24) : baseLimit;

  const posts = useMemo(
    () => splitIntoPosts(text, { limit: safeLimit, separator, marker }),
    [text, safeLimit, separator, marker]
  );

  const targetTweetId = parseTweetId(targetLink);
  const selectedProfile = profiles.find((p) => p.id === profileId) || null;

  const resetProgress = () => {
    setDoneIndexes(new Set());
    setPostError(null);
  };

  const handleTextChange = (value: string) => {
    setText(value);
    resetProgress();
  };

  const handleCopy = async (index: number) => {
    try {
      await navigator.clipboard.writeText(posts[index]);
      setCopiedIndex(index);
      setDoneIndexes((prev) => new Set(prev).add(index));
      setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 800);
    } catch (error) {
      console.error('Error copying post:', error);
    }
  };

  const intentUrl = (text: string, extra = '') => `https://x.com/intent/post?${extra}text=${encodeURIComponent(text)}`;
  const quoteParam = () => `url=${encodeURIComponent(`https://x.com/i/status/${targetTweetId}`)}&`;

  /**
   * Imágenes listas para cruzar al proceso nativo (contenido en base64). En Android el puente es más lento y la
   * memoria menor, así que las fotos grandes se reducen (JPEG, 2048 px como máximo) antes de enviarlas.
   */
  const imagePayload = async () => {
    const shrink = capabilities.browserView;
    return Promise.all(
      images.map(async ({ name, mime, dataUrl }) => {
        const plain = { name, mime, data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
        if (!shrink || mime === 'image/gif' || plain.data.length < 1_500_000) return plain;
        try {
          const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
          const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(bitmap.width * scale);
          canvas.height = Math.round(bitmap.height * scale);
          canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const jpeg = canvas.toDataURL('image/jpeg', 0.85);
          return { name: name.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', data: jpeg.slice(jpeg.indexOf(',') + 1) };
        } catch {
          return plain;
        }
      })
    );
  };

  /**
   * Automatiza el compositor de X. Si falla, abre el compositor por URL con el texto (plan B) y muestra el error
   * contraído con el motivo. `doneIndexes` son los posts que se marcan como hechos si todo va bien.
   */
  const runAutomation = async (options: {
    summary: string;
    action: () => Promise<boolean>;
    fallbackUrl: string;
    fallbackNote: string;
    doneIndexes: number[];
  }) => {
    if (!selectedProfile) return;
    setPostError(null);
    setThreadBusy(true);
    let reason = 'unknown error';
    try {
      if (await options.action()) {
        setDoneIndexes((prev) => new Set([...prev, ...options.doneIndexes]));
        return;
      }
      reason = 'not supported on this platform';
    } catch (error) {
      console.error(options.summary, error);
      reason = error instanceof Error ? error.message : String(error);
    } finally {
      setThreadBusy(false);
    }
    try {
      await platformAPI.launcher.openUrl(selectedProfile.id, options.fallbackUrl);
    } catch (error) {
      console.error('Error opening the fallback composer:', error);
    }
    const imageNote = images.length > 0 ? ' The images were not attached: add them by hand.' : '';
    setPostError({ summary: options.summary, details: `${reason}\n\n${options.fallbackNote}${imageNote}` });
  };

  const handlePost = async (index: number) => {
    if (!selectedProfile) return;
    const withImages = index === 0 && images.length > 0 && capabilities.postImages;

    if (isQuote && capabilities.postQuote && index === 0 && targetTweetId) {
      await runAutomation({
        summary: 'Could not quote automatically',
        action: async () => platformAPI.launcher.openQuote(selectedProfile.id, targetTweetId, posts[0], await imagePayload()),
        fallbackUrl: intentUrl(posts[0], quoteParam()),
        fallbackNote: 'Opened the composer with the post link instead.',
        doneIndexes: [0],
      });
      return;
    }

    if (isReply && withImages && targetTweetId) {
      await runAutomation({
        summary: 'Could not reply automatically',
        action: async () => platformAPI.launcher.openReply(selectedProfile.id, targetTweetId, posts[0], await imagePayload()),
        fallbackUrl: intentUrl(posts[0], `in_reply_to=${targetTweetId}&`),
        fallbackNote: 'Opened the reply composer instead.',
        doneIndexes: [0],
      });
      return;
    }

    if (!hasTarget && withImages) {
      await runAutomation({
        summary: 'Could not attach the images automatically',
        action: async () => platformAPI.launcher.openThread(selectedProfile.id, [posts[0]], await imagePayload()),
        fallbackUrl: intentUrl(posts[0]),
        fallbackNote: 'Opened the post composer instead.',
        doneIndexes: [0],
      });
      return;
    }

    setPostError(null);
    try {
      const extra = !targetTweetId ? '' : isReply ? `in_reply_to=${targetTweetId}&` : isQuote ? quoteParam() : '';
      const ok = await platformAPI.launcher.openUrl(selectedProfile.id, intentUrl(posts[index], extra));
      if (!ok) {
        setPostError({ summary: `Could not open the post composer in "${selectedProfile.name}"` });
        return;
      }
      setDoneIndexes((prev) => new Set(prev).add(index));
    } catch (error) {
      console.error('Error opening post composer:', error);
      setPostError({ summary: `Could not open the post composer in "${selectedProfile.name}"` });
    }
  };

  const handlePostThread = async () => {
    if (!selectedProfile || posts.length < 2) return;
    await runAutomation({
      summary: 'Could not build the thread',
      action: async () => platformAPI.launcher.openThread(selectedProfile.id, posts, await imagePayload()),
      fallbackUrl: intentUrl(posts[0]),
      fallbackNote: 'Opened the first post instead.',
      doneIndexes: posts.map((_, i) => i),
    });
  };

  const addImageFiles = (files: File[]) => {
    const accepted = files.filter((file) => file.type.startsWith('image/'));
    if (accepted.length === 0) return;
    const room = MAX_IMAGES - images.length;
    if (accepted.length > room) setImageNote(`X allows up to ${MAX_IMAGES} images per post.`);
    else setImageNote(null);
    accepted.slice(0, Math.max(0, room)).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () =>
        setImages((prev) =>
          prev.length >= MAX_IMAGES
            ? prev
            : [...prev, { id: `${Date.now()}-${Math.random()}`, name: file.name || 'image.png', mime: file.type, dataUrl: String(reader.result) }]
        );
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((image) => image.id !== id));
    setImageNote(null);
  };

  const trackSelection = () => {
    const el = textareaRef.current;
    if (el) setSelection({ start: el.selectionStart, end: el.selectionEnd });
  };

  const handleStyle = (flag: StyleFlag | 'clear') => {
    const { start, end } = selection;

    // Sin selección: el botón queda hundido y lo que se escriba lleva ese estilo
    if (start === end) {
      setActiveStyles((prev) => {
        if (flag === 'clear') return new Set();
        const next = new Set(prev);
        if (next.has(flag)) {
          next.delete(flag);
        } else {
          next.add(flag);
          // El monoespacio no se combina con negrita/cursiva
          if (flag === 'monospace') {
            next.delete('bold');
            next.delete('italic');
          } else if (flag === 'bold' || flag === 'italic') {
            next.delete('monospace');
          }
        }
        return next;
      });
      textareaRef.current?.focus();
      return;
    }

    const selected = text.slice(start, end);
    const styled = flag === 'clear' ? clearStyles(selected) : toggleStyle(selected, flag);
    handleTextChange(text.slice(0, start) + styled + text.slice(end));
    const newEnd = start + styled.length;
    setSelection({ start, end: newEnd });
    // Se mantiene el texto estilizado seleccionado para poder encadenar estilos
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, newEnd);
    });
  };

  // Al escribir con estilos activos, el texto insertado se convierte al momento
  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const inputType = (e.nativeEvent as InputEvent).inputType;
    if (activeStyles.size === 0 || inputType !== 'insertText') {
      handleTextChange(value);
      return;
    }

    let prefix = 0;
    while (prefix < text.length && prefix < value.length && text[prefix] === value[prefix]) prefix++;
    let suffix = 0;
    while (
      suffix < text.length - prefix &&
      suffix < value.length - prefix &&
      text[text.length - 1 - suffix] === value[value.length - 1 - suffix]
    ) {
      suffix++;
    }
    const inserted = value.slice(prefix, value.length - suffix);
    const styled = styleTyped(inserted, activeStyles);
    const next = value.slice(0, prefix) + styled + value.slice(value.length - suffix);
    const caret = prefix + styled.length;

    handleTextChange(next);
    setSelection({ start: caret, end: caret });
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(caret, caret));
  };

  const handleLaunchProfile = async (id: string) => {
    try {
      await platformAPI.launcher.launch(id, 'https://x.com');
    } catch (error) {
      console.error('Error launching profile:', error);
    }
  };

  const handleCloseProfile = async (id: string) => {
    try {
      await platformAPI.launcher.close(id);
    } catch (error) {
      console.error('Error closing profile:', error);
    }
  };

  const handleDeleteProfile = async (id: string) => {
    try {
      if (id === profileId) setProfileId(null);
      await platformAPI.profiles.delete(id);
    } catch (error) {
      console.error('Error deleting profile:', error);
    }
  };

  const handleCreateProfile = (folderId?: string) => {
    setCreateModalFolderId(folderId);
    setShowCreateModal(true);
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await platformAPI.folders.delete(folderId);
      onFoldersChange?.();
    } catch (error) {
      console.error('Error deleting folder:', error);
    }
  };

  const handleMoveProfileToFolder = async (id: string, folderId: string | undefined) => {
    try {
      await platformAPI.profiles.update(id, { folderId });
    } catch (error) {
      console.error('Error moving profile to folder:', error);
    }
  };

  const handleToggleStar = async (id: string) => {
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;
    try {
      await platformAPI.profiles.update(id, { starred: !profile.starred });
    } catch (error) {
      console.error('Error toggling star:', error);
    }
  };

  const handleOpenAllInBrowser = async (folderId: string) => {
    const folderProfiles = profiles.filter((p) => p.folderId === folderId || (folderId === 'ungrouped' && !p.folderId));
    for (const profile of folderProfiles) {
      try {
        await platformAPI.launcher.launch(profile.id, 'https://x.com');
      } catch (error) {
        console.error('Error launching profile:', profile.id, error);
      }
    }
  };

  const handleCloseAllInFolder = async (folderId: string | null) => {
    if (!folderId || typeof folderId !== 'string') return;
    const folderProfiles = profiles.filter((p) => p.folderId === folderId || (folderId === 'ungrouped' && !p.folderId));
    for (const profile of folderProfiles) {
      if (activeStatuses.get(profile.id)) {
        try {
          await platformAPI.launcher.close(profile.id);
        } catch (error) {
          console.error('Error closing profile:', profile.id, error);
        }
      }
    }
  };

  const profileCountByFolder = useMemo(() => {
    const map = new Map<string | undefined, number>();
    for (const p of profiles) {
      map.set(p.folderId, (map.get(p.folderId) || 0) + 1);
    }
    return map;
  }, [profiles]);

  return (
    <div className="ph-container">
      <Sidebar
        folders={folders}
        profiles={profiles}
        selectedFolderId={selectedFolderId}
        expandedFolders={expandedFolders}
        expandedOthers={expandedOthers}
        onSelectFolder={onSelectFolder}
        onToggleFolder={onToggleFolder}
        onToggleOthers={onToggleOthers}
        onCreateFolder={() => setShowCreateFolderModal(true)}
        onEditFolder={setEditingFolder}
        onDeleteFolder={handleDeleteFolder}
        onCreateProfile={handleCreateProfile}
        onEditProfile={setProfileForEdit}
        onDeleteProfile={handleDeleteProfile}
        onToggleStar={handleToggleStar}
        onLaunchProfile={handleLaunchProfile}
        onCloseProfile={handleCloseProfile}
        onOpenAllInBrowser={handleOpenAllInBrowser}
        onCloseAll={handleCloseAllInFolder}
        onMoveProfileToFolder={handleMoveProfileToFolder}
        profileCountByFolder={profileCountByFolder}
        activeStatuses={activeStatuses}
        onGoToDashboard={onGoToDashboard}
        onGoToFolders={onGoToFolders}
        onOpenSettings={onGoToSettings}
        onGoToCharacterHub={onGoToCharacterHub}
        onGoToPasswordManager={onGoToPasswordManager}
        onGoToMailManager={onGoToMailManager}
        showPasswordManager={showPasswordManager}
        showMailManager={showMailManager}
        showCharacterHub={showCharacterHub}
        showFreedcamp={showFreedcamp}
        showDashboard={showDashboard}
        onToggleAllFolders={onToggleAllFolders}
      />

      <div className="ph-content">
        <div className="panel-header">
          <div className="panel-header-content">
            <h2 className="ph-title">Post Helper</h2>
          </div>
        </div>

        <div className="ph-body">
          <div className="ph-workspace">
            {/* Columna izquierda: Action y Text (mismo ancho). Columna derecha: Profile y Posts (mismo ancho) */}
            <div className="ph-col ph-col-left">
          <section className="ph-section ph-section-action">
            <div className="ph-section-head">
              <div className="ph-section-title">
                <span className="ph-badge">
                  {isReply ? <Reply size={18} weight="Outline" /> : isQuote ? <QuoteUp size={18} weight="Outline" /> : <Send size={18} weight="Outline" />}
                </span>
                <div>
                  <h3>Action</h3>
                  <p>{isReply ? 'Reply to an existing post' : isQuote ? 'Quote an existing post' : 'Publish new posts'}</p>
                </div>
              </div>
            </div>
            <div className="ph-action-row">
            <div className="ph-segmented" role="radiogroup" aria-label="Action">
              {(['new', 'reply', 'quote'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  className={`ph-segment${mode === value ? ' ph-segment-active' : ''}`}
                  onClick={() => {
                    setMode(value);
                    setPostError(null);
                  }}
                >
                  {value === 'new' ? 'New' : value === 'reply' ? 'Reply' : 'Quote'}
                </button>
              ))}
            </div>
            {hasTarget && (
              <div className="ph-reply-field">
                <input
                  type="text"
                  className={`ph-reply-input${targetLink.trim() && !targetTweetId ? ' ph-reply-input-invalid' : ''}`}
                  placeholder="Post link (x.com/user/status/…)"
                  value={targetLink}
                  onChange={(e) => setTargetLink(e.target.value)}
                  aria-label={`Link of the post to ${isReply ? 'reply to' : 'quote'}`}
                />
                {targetLink.trim() && !targetTweetId && (
                  <span className="ph-reply-hint">That does not look like a post link.</span>
                )}
              </div>
            )}
            </div>
          </section>

          <section className="ph-section ph-section-text">
            <div className="ph-section-head">
              <div className="ph-section-title">
                <span className="ph-badge"><Pen2 size={18} weight="Outline" /></span>
                <div>
                  <h3>Text</h3>
                  <p>Drag the corner to narrow it and the posts move beside it</p>
                </div>
              </div>
            </div>
            <div
              className={`ph-editor${dragActive ? ' ph-editor-drop' : ''}`}
              onDragOver={(e) => {
                if (!capabilities.postImages || !e.dataTransfer.types.includes('Files')) return;
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false);
              }}
              onDrop={(e) => {
                if (!capabilities.postImages || !e.dataTransfer.types.includes('Files')) return;
                e.preventDefault();
                setDragActive(false);
                addImageFiles(Array.from(e.dataTransfer.files));
              }}
            >
            <div className="ph-toolbar" role="toolbar" aria-label="Text style">
              {STYLE_BUTTONS.map(({ flag, label, title, divider }) => {
                const pressed = flag !== 'clear' && activeStyles.has(flag);
                return (
                  <React.Fragment key={flag}>
                    {divider && <span className="ph-toolbar-divider" aria-hidden="true" />}
                    <button
                      type="button"
                      className={`ph-toolbar-btn${pressed ? ' ph-toolbar-btn-active' : ''}`}
                      title={title}
                      aria-label={title}
                      aria-pressed={flag === 'clear' ? undefined : pressed}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleStyle(flag)}
                    >
                      {flag === 'clear' ? label : styleTyped(label, new Set([flag]))}
                    </button>
                  </React.Fragment>
                );
              })}
              <span className="ph-toolbar-divider" aria-hidden="true" />
              {capabilities.postImages && (
                <>
                  <button
                    type="button"
                    className="ph-toolbar-btn"
                    title={`Attach images to the first post (up to ${MAX_IMAGES})`}
                    aria-label="Attach image"
                    disabled={images.length >= MAX_IMAGES}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus size={16} weight="Outline" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    multiple
                    hidden
                    onChange={(e) => {
                      addImageFiles(Array.from(e.target.files ?? []));
                      e.target.value = '';
                    }}
                  />
                  <span className="ph-toolbar-divider" aria-hidden="true" />
                </>
              )}
              <label className="ph-font-size" title="Editor font size (does not affect the posts)">
                <span aria-hidden="true">Aa</span>
                <select
                  value={fontSize}
                  aria-label="Editor font size"
                  onChange={(e) => {
                    const size = parseInt(e.target.value, 10);
                    setFontSize(size);
                    localStorage.setItem(FONT_SIZE_KEY, String(size));
                  }}
                >
                  {FONT_SIZES.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
            </div>
            <textarea
              ref={textareaRef}
              className="ph-textarea"
              style={{ fontSize: `${fontSize}px` }}
              onSelect={trackSelection}
              onPaste={(e) => {
                if (!capabilities.postImages) return;
                const files = Array.from(e.clipboardData.files).filter((file) => file.type.startsWith('image/'));
                if (files.length === 0) return;
                e.preventDefault();
                addImageFiles(files);
              }}
              placeholder={`Write or paste your text. Use a line with ${separator.trim() || DEFAULT_SEPARATOR} to force a new post.`}
              value={text}
              onChange={handleEditorChange}
              rows={8}
            />
            {capabilities.postImages && images.length > 0 && (
              <div className="ph-images">
                {images.map((image) => (
                  <div key={image.id} className="ph-image" title={image.name}>
                    <img src={image.dataUrl} alt={image.name} />
                    <button
                      type="button"
                      className="ph-image-remove"
                      onClick={() => removeImage(image.id)}
                      aria-label={`Remove ${image.name}`}
                      title="Remove"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
                <span className="ph-images-hint">Attached to the first post</span>
              </div>
            )}
            </div>
            {imageNote && <span className="ph-image-note">{imageNote}</span>}
            <div className="ph-options">
              <div className="ph-option">
                <span className="ph-option-label">
                  Separator
                  <button
                    type="button"
                    className={`ph-help-btn${helpOpen === 'separator' ? ' ph-help-btn-on' : ''}`}
                    onClick={() => setHelpOpen((open) => (open === 'separator' ? null : 'separator'))}
                    aria-label="What is the separator?"
                    aria-expanded={helpOpen === 'separator'}
                  >
                    ?
                  </button>
                </span>
                <input
                  type="text"
                  className="ph-option-input"
                  aria-label="Separator"
                  value={separator}
                  onChange={(e) => {
                    setSeparator(e.target.value);
                    resetProgress();
                  }}
                />
              </div>
              <div className="ph-option">
                <span className="ph-option-label">
                  Marker
                  <button
                    type="button"
                    className={`ph-help-btn${helpOpen === 'marker' ? ' ph-help-btn-on' : ''}`}
                    onClick={() => setHelpOpen((open) => (open === 'marker' ? null : 'marker'))}
                    aria-label="What is the marker?"
                    aria-expanded={helpOpen === 'marker'}
                  >
                    ?
                  </button>
                </span>
                <input
                  type="text"
                  className="ph-option-input"
                  aria-label="Marker"
                  value={marker}
                  onChange={(e) => {
                    setMarker(e.target.value);
                    resetProgress();
                  }}
                  // Un símbolo de cierre suelto (>) se completa con su pareja (> ... <) al terminar de escribirlo
                  onBlur={() => setMarker((current) => autoPairMarker(current))}
                />
              </div>
              <label>
                Max length
                <input
                  type="number"
                  className="ph-option-input"
                  min={20}
                  value={limit}
                  onChange={(e) => {
                    setLimit(parseInt(e.target.value, 10));
                    resetProgress();
                  }}
                />
              </label>
              <button
                type="button"
                className="btn-secondary ph-preview-btn"
                onClick={() => setShowPreview(true)}
                title="Show the whole text in a larger view"
              >
                <Eye size={14} weight="Outline" />
                <span>Preview</span>
              </button>
            </div>
            {helpOpen === 'separator' && (
              <p className="ph-help-text">
                Where <strong>you</strong> want to cut. Write <code>{separator.trim() || DEFAULT_SEPARATOR}</code> on its own in the text
                to force a new post at that point. It is not included in the posts.
              </p>
            )}
            {helpOpen === 'marker' && (
              <p className="ph-help-text">
                Added by the tool to show that the text continues. By default it goes at the end of a post and at the start of the next
                one (e.g. <code>{DEFAULT_MARKER}</code>). Write <code>end ... start</code> to use a different one on each side:{' '}
                <code>&gt; ... &lt;</code> ends posts with <code>&gt;</code> and starts the next with <code>&lt;</code>. Typing just one
                side of a pair completes it for you. Pairs that work this way:{' '}
                {MARKER_PAIRS.map(({ end, start }) => (
                  <React.Fragment key={end}>
                    <code>{`${end} ... ${start}`}</code>{' '}
                  </React.Fragment>
                ))}
                If it includes <code>{COUNTER_TOKEN}</code> it goes at the end of every post with
                its number: 1/3, 2/3, 3/3. Leave it empty for none.
              </p>
            )}
          </section>
            </div>
            <div className="ph-col ph-col-right">
          <section className="ph-section ph-section-profile">
            <div className="ph-section-head">
              <div className="ph-section-title">
                <span className="ph-badge"><UserCircle size={18} weight="Outline" /></span>
                <div>
                  <h3>Profile</h3>
                  <p>Who is going to post</p>
                </div>
              </div>
            </div>
            <ProfileCombobox
              profiles={profiles}
              activeStatuses={activeStatuses}
              value={profileId}
              onChange={setProfileId}
            />
          </section>

          <section className="ph-section ph-section-posts">
            <div className="ph-section-head">
              <div className="ph-section-title">
                <span className="ph-badge"><ChatRoundDots size={18} weight="Outline" /></span>
                <div>
                  <h3>Posts</h3>
                  <p>{selectedProfile ? `Posting as ${selectedProfile.name}` : 'Select a profile to post'}</p>
                </div>
              </div>
              <div className="ph-section-actions">
                {capabilities.postThread && !hasTarget && posts.length > 1 && (
                  <button
                    className="btn-primary ph-btn ph-btn-icon"
                    disabled={!selectedProfile || threadBusy}
                    onClick={handlePostThread}
                    aria-label="Post thread"
                    title={
                      threadBusy
                        ? 'Building thread...'
                        : selectedProfile
                          ? `Post thread: fill the X composer with all ${posts.length} posts in ${selectedProfile.name} (you press "Post all")`
                          : 'Post thread (select a profile first)'
                    }
                  >
                    <ThreadIcon size={16} />
                  </button>
                )}
                <span className="ph-count-pill">{posts.length}</span>
                {posts.length > 0 && (
                  <button
                    type="button"
                    className={`ph-chevron${postsHidden ? '' : ' ph-chevron-open'}`}
                    onClick={() => setPostsHidden((hidden) => !hidden)}
                    title={postsHidden ? 'Show posts' : 'Hide posts'}
                    aria-label={postsHidden ? 'Show posts' : 'Hide posts'}
                    aria-expanded={!postsHidden}
                  >
                    <ChevronDown size={18} weight="Outline" />
                  </button>
                )}
              </div>
            </div>
            {postError && (
              <div className="ph-error">
                <div className="ph-error-head">
                  <span className="ph-error-summary">{postError.summary}</span>
                  {postError.details && (
                    <button
                      type="button"
                      className={`ph-chevron ph-chevron-error${errorExpanded ? ' ph-chevron-open' : ''}`}
                      onClick={() => setErrorExpanded((expanded) => !expanded)}
                      title={errorExpanded ? 'Hide details' : 'Show details'}
                      aria-label={errorExpanded ? 'Hide error details' : 'Show error details'}
                      aria-expanded={errorExpanded}
                    >
                      <ChevronDown size={16} weight="Outline" />
                    </button>
                  )}
                </div>
                {postError.details && errorExpanded && <div className="ph-error-details">{postError.details}</div>}
              </div>
            )}
            {postsHidden && posts.length > 0 ? null : posts.length === 0 ? (
              <p className="ph-muted">Your posts will appear here.</p>
            ) : (
              <div className="ph-posts">
                {posts.map((post, index) => {
                  const length = postLength(post);
                  const done = doneIndexes.has(index);
                  return (
                    <div key={index} className={`ph-post${done ? ' ph-post-done' : ''}`}>
                      <div className="ph-post-text">{post}</div>
                      <div className="ph-post-footer">
                        <span className={`ph-count${length > safeLimit ? ' ph-count-over' : ''}`}>
                          {index + 1}/{posts.length} · {length}/{safeLimit}
                        </span>
                        <div className="ph-post-actions">
                          <button
                            className="btn-secondary ph-btn ph-btn-icon"
                            onClick={() => handleCopy(index)}
                            aria-label="Copy"
                            title={copiedIndex === index ? 'Copied!' : 'Copy'}
                          >
                            {copiedIndex === index ? <CopySuccess size={16} weight="Outline" /> : <Copy size={16} weight="Outline" />}
                          </button>
                          {(!hasTarget || index === 0) && (
                            <button
                              className="btn-primary ph-btn ph-btn-icon"
                              disabled={!selectedProfile || threadBusy || (hasTarget && !targetTweetId)}
                              onClick={() => handlePost(index)}
                              aria-label={isReply ? 'Reply' : isQuote ? 'Quote' : 'Post'}
                              title={
                                !selectedProfile
                                  ? 'Select a profile first'
                                  : hasTarget
                                    ? targetTweetId
                                      ? `${isReply ? 'Reply to' : 'Quote'} the post in ${selectedProfile.name}`
                                      : `Paste the link of the post to ${isReply ? 'reply to' : 'quote'}`
                                    : `Post: open composer in ${selectedProfile.name}`
                              }
                            >
                              {isReply ? <Reply size={16} weight="Outline" /> : isQuote ? <QuoteUp size={16} weight="Outline" /> : <Send size={16} weight="Outline" />}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
            </div>
          </div>
        </div>
      </div>

      {showPreview && <PostPreviewModal text={text} images={capabilities.postImages ? images : []} fontSize={fontSize} onClose={() => setShowPreview(false)} />}

      {showCreateModal && (
        <ProfileModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            setCreateModalFolderId(undefined);
          }}
          selectedFolderId={createModalFolderId || selectedFolderId}
          folders={folders}
        />
      )}

      {profileForEdit && (
        <ProfileModal
          profile={profileForEdit}
          onClose={() => setProfileForEdit(null)}
          onSuccess={() => setProfileForEdit(null)}
          folders={folders}
        />
      )}

      {showCreateFolderModal && (
        <CreateFolderModal
          onClose={() => setShowCreateFolderModal(false)}
          onCreated={() => {
            setShowCreateFolderModal(false);
            onFoldersChange?.();
          }}
        />
      )}

      {editingFolder && (
        <EditFolderModal
          folder={editingFolder}
          onClose={() => setEditingFolder(null)}
          onUpdated={() => {
            setEditingFolder(null);
            onFoldersChange?.();
          }}
        />
      )}
    </div>
  );
}
