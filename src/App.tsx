import { useCallback, useRef, useState } from "react";
import {
  ArrowRight,
  Box,
  Boxes,
  Check,
  ChevronDown,
  CircleHelp,
  FileArchive,
  FileBox,
  FileCode2,
  Globe2,
  Layers3,
  LockKeyhole,
  MousePointer2,
  ShieldCheck,
  UploadCloud,
  X,
  Zap,
} from "lucide-react";
import { Brand } from "./Brand";
import { Viewer } from "./Viewer";
import { ACCEPTED_FILE_TYPES, isAcceptedFile, isModelFile } from "./formats";

const IMPRINT_URL = "https://github.com/jfk-solutions/.github/blob/main/profile/imprint.md";
const PRIVACY_URL = `${import.meta.env.BASE_URL}datenschutz.html`;

type DropZoneProps = {
  onFiles: (files: File[]) => void;
  compact?: boolean;
};

export function DropZone({ onFiles, compact = false }: DropZoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const takeFiles = useCallback((list: FileList | null) => {
    if (list?.length) onFiles([...list]);
  }, [onFiles]);

  return (
    <div
      className={`drop-zone ${compact ? "drop-zone-compact" : ""} ${dragging ? "is-dragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); takeFiles(event.dataTransfer.files); }}
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") input.current?.click(); }}
      aria-label="Choose or drop 3D model files"
    >
      <input ref={input} hidden type="file" multiple accept={ACCEPTED_FILE_TYPES} onChange={(event) => takeFiles(event.target.files)} />
      <div className="drop-icon"><UploadCloud size={compact ? 20 : 27} strokeWidth={1.7} /></div>
      <div className="drop-copy">
        <strong>{compact ? "Open another model" : "Drop your 3D model here"}</strong>
        {!compact && <span>or click to browse your computer</span>}
      </div>
      {!compact && <button type="button" className="choose-button">Choose files <ArrowRight size={16} /></button>}
      {!compact && <div className="drop-formats">IPT · IAM · DWG · DEMO3D · RAW3D · GLB · OBJ · STL</div>}
    </div>
  );
}

function Home({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [formatsOpen, setFormatsOpen] = useState(false);
  return (
    <main className="home">
      <nav className="site-nav page-width">
        <Brand />
        <div className="nav-links">
          <a href="#formats">Formats</a>
          <a href="#privacy">How it works</a>
          <a href={PRIVACY_URL} target="_blank" rel="noreferrer">Datenschutz</a>
          <a href={IMPRINT_URL} target="_blank" rel="noreferrer">Impressum</a>
        </div>
      </nav>

      <section className="hero page-width">
        <div className="hero-copy">
          <div className="eyebrow"><span /> Browser-based CAD viewing by JFK Solutions</div>
          <h1>Your CAD data.<br /><em>Right here.</em></h1>
          <p>Open Inventor, AutoCAD and Demo3D files — plus common Three.js 3D formats — directly in your browser. No installation. No upload.</p>
          <div className="trust-row">
            <span><ShieldCheck size={17} /> Processed locally</span>
            <span><Zap size={17} /> Opens in seconds</span>
          </div>
        </div>
        <div className="hero-action">
          <DropZone onFiles={onFiles} />
          <p className="privacy-note"><LockKeyhole size={14} /> Your files stay on this device and are never sent to a server.</p>
        </div>
      </section>

      <section className="format-strip" id="formats">
        <div className="page-width format-strip-inner">
          <span className="format-intro">Supported formats</span>
          <div className="format-pills">
            <span><FileBox size={18} /> Inventor <b>IPT</b></span>
            <span><Boxes size={18} /> Assembly <b>IAM</b></span>
            <span><FileCode2 size={18} /> Drawing <b>IDW</b></span>
            <span><Layers3 size={18} /> AutoCAD <b>DWG / DXF</b></span>
            <span><FileArchive size={18} /> Workspace <b>ZIP</b></span>
            <span><Box size={18} /> 3D models <b>GLB / STL</b></span>
            <span><Box size={18} /> Simulation <b>DEMO3D / RAW3D</b></span>
          </div>
          <button className="format-more" type="button" onClick={() => setFormatsOpen(!formatsOpen)} aria-expanded={formatsOpen}>
            All formats <ChevronDown size={15} className={formatsOpen ? "rotated" : ""} />
          </button>
        </div>
        {formatsOpen && (
          <div className="format-details page-width">
            <div><strong>Inventor 3D</strong><span>.ipt parts, .iam assemblies, .ipn presentations</span></div>
            <div><strong>Inventor 2D</strong><span>.idw drawings and Inventor .dwg references</span></div>
            <div><strong>AutoCAD</strong><span>.dwg and ASCII or binary .dxf drawings</span></div>
            <div><strong>Packaged projects</strong><span>.zip workspaces and .faf Factory Assets with linked files</span></div>
            <div><strong>Three.js models</strong><span>.glb, .gltf, .obj, .stl, .ply, .fbx, .3mf, .dae, .usdz and more</span></div>
            <div><strong>VRML worlds</strong><span>.wrl and .vrml models, plus gzip-compressed .wrz files</span></div>
            <div><strong>Demo3D simulation</strong><span>.demo3d projects and render-ready .raw3d scenes</span></div>
          </div>
        )}
      </section>

      <section className="value-section page-width" id="privacy">
        <div className="section-heading">
          <span className="section-number">01 — 03</span>
          <h2>Engineering files should be<br />easy to <em>see.</em></h2>
          <p>Built for quick reviews with suppliers, customers and teammates — without opening a full CAD workstation.</p>
        </div>
        <div className="value-cards">
          <article>
            <span className="card-index">01</span><div className="card-icon"><Globe2 /></div>
            <h3>Nothing to install</h3><p>Works in a modern browser on desktop or tablet. Share the public link, not another installer.</p>
          </article>
          <article>
            <span className="card-index">02</span><div className="card-icon"><LockKeyhole /></div>
            <h3>Private by design</h3><p>Parsing and rendering happen locally. Proprietary models never leave the device.</p>
          </article>
          <article>
            <span className="card-index">03</span><div className="card-icon"><MousePointer2 /></div>
            <h3>Made for inspection</h3><p>Intuitive orbit controls, object selection, assembly hierarchy and a focused property grid.</p>
          </article>
        </div>
      </section>

      <section className="cta-section">
        <div className="page-width cta-inner">
          <div><span>Ready when you are</span><h2>Take a closer look.</h2></div>
          <button type="button" onClick={() => document.querySelector<HTMLElement>(".drop-zone")?.click()}>Open a 3D file <ArrowRight size={18} /></button>
        </div>
      </section>

      <footer className="site-footer page-width">
        <Brand />
        <p>Digital engineering solutions from Offenau, Germany.</p>
        <div><a href="https://jfk-solutions.de" target="_blank" rel="noreferrer">jfk-solutions.de</a><a href={PRIVACY_URL} target="_blank" rel="noreferrer">Datenschutz</a><a href={IMPRINT_URL} target="_blank" rel="noreferrer">Impressum</a></div>
      </footer>
    </main>
  );
}

export function App() {
  const [files, setFiles] = useState<File[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openFiles = useCallback((next: File[]) => {
    const unsupported = next.find((file) => !isAcceptedFile(file.name));
    if (unsupported) {
      setError(`${unsupported.name} is not a supported model or resource file.`);
      return;
    }
    if (!next.some((file) => isModelFile(file.name))) {
      setError("Choose a supported 3D model file. Textures and sidecar files can be selected with it.");
      return;
    }
    setError(null);
    setFiles(next);
  }, []);

  if (files) return <Viewer files={files} onClose={() => setFiles(null)} onOpenFiles={openFiles} />;

  return (
    <>
      <Home onFiles={openFiles} />
      {error && <div className="toast" role="alert"><CircleHelp size={19} /><span>{error}</span><button onClick={() => setError(null)} aria-label="Dismiss"><X size={16} /></button></div>}
    </>
  );
}
