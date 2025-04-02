"use client";

import React, { useState, useRef, useEffect, ReactElement, MouseEvent } from "react";
import { useDropzone } from "react-dropzone";
import { Document, Page, pdfjs } from "react-pdf";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import "react-pdf/dist/esm/Page/TextLayer.css";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";

// Set the PDF worker source (make sure pdf.worker.mjs is in public/)
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

interface OnDocumentLoadSuccessParams {
  numPages: number;
}

type Tool = "highlight" | "underline" | "comment" | "signature" | null;

interface Annotation {
  id: string;
  type: Tool;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  text?: string;
  path?: { x: number; y: number }[];
}

// Helper function to convert an Oklab color string to an RGB string
const oklabToRgb = (oklabStr: string): string | null => {
  const match = oklabStr.match(/oklab\(([^)]+)\)/i);
  if (!match) return null;
  const values = match[1].trim().split(/[\s,]+/).map(Number);
  if (values.length < 3) return null;
  const [L, a, b] = values;
  const l = L + 0.3963377774 * a + 0.2158037573 * b;
  const m = L - 0.1055613458 * a - 0.0638541728 * b;
  const s = L - 0.0894841775 * a - 1.2914855480 * b;
  const l3 = l * l * l;
  const m3 = m * m * m;
  const s3 = s * s * s;
  let R = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  let G = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  let B = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
  R = Math.min(Math.max(R, 0), 1);
  G = Math.min(Math.max(G, 0), 1);
  B = Math.min(Math.max(B, 0), 1);
  R = Math.round(R * 255);
  G = Math.round(G * 255);
  B = Math.round(B * 255);
  return `rgb(${R}, ${G}, ${B})`;
};

export default function Home(): ReactElement {
  const [pdfFile, setPdfFile] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // Annotation state
  const [activeTool, setActiveTool] = useState<Tool>(null);
  const [annotationColor, setAnnotationColor] = useState<string>("#ffff00");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const [signaturePath, setSignaturePath] = useState<{ x: number; y: number }[]>([]);

  // Update container width on mount and resize
  useEffect(() => {
    const updateWidth = () => {
      if (pdfContainerRef.current) {
        setContainerWidth(pdfContainerRef.current.offsetWidth);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // Dropzone for PDF file upload
  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result && typeof reader.result === "string") {
          setPdfFile(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [] },
  });

  const onDocumentLoadSuccess = ({ numPages }: OnDocumentLoadSuccessParams) => {
    setNumPages(numPages);
  };

  // Export annotated view as PDF
  const exportPDF = async (): Promise<void> => {
    if (pdfContainerRef.current) {
      try {
        const canvas = await html2canvas(pdfContainerRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          onclone: (clonedDoc) => {
            clonedDoc.querySelectorAll("*").forEach((node) => {
              const element = node as HTMLElement;
              const computedStyle = window.getComputedStyle(element);
              if (computedStyle.color.includes("oklab")) {
                const rgbColor = oklabToRgb(computedStyle.color);
                if (rgbColor) {
                  element.style.color = rgbColor;
                }
              }
              if (computedStyle.backgroundColor.includes("oklab")) {
                const rgbBg = oklabToRgb(computedStyle.backgroundColor);
                if (rgbBg) {
                  element.style.backgroundColor = rgbBg;
                }
              }
            });
          },
        });
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF("p", "pt", "a4");
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
        pdf.save("annotated.pdf");
      } catch (error) {
        console.error("Error exporting PDF:", error);
      }
    }
  };

  // Tool selection handler
  const handleToolSelect = (tool: Tool) => {
    setActiveTool(tool);
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAnnotationColor(e.target.value);
  };

  // Handle mouse events on the annotation overlay
  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!activeTool) return;
    setIsDrawing(true);
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setStartPos({ x, y });
    if (activeTool === "signature") {
      setSignaturePath([{ x, y }]);
    }
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !activeTool) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentPos({ x, y });
    if (activeTool === "signature") {
      setSignaturePath((prev) => [...prev, { x, y }]);
    }
  };

  const handleMouseUp = (e: MouseEvent<HTMLDivElement>) => {
    void e;
    if (!isDrawing || !activeTool) return;
    setIsDrawing(false);
    if (activeTool === "signature") {
      const id = Date.now().toString();
      setAnnotations((prev) => [
        ...prev,
        {
          id,
          type: activeTool,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          color: annotationColor,
          path: signaturePath,
        },
      ]);
      setSignaturePath([]);
    } else if (startPos && currentPos) {
      if (
        Math.abs(currentPos.x - startPos.x) < 5 ||
        Math.abs(currentPos.y - startPos.y) < 5
      ) {
        setStartPos(null);
        setCurrentPos(null);
        return;
      }
      const id = Date.now().toString();
      const x = Math.min(startPos.x, currentPos.x);
      const y = Math.min(startPos.y, currentPos.y);
      const width = Math.abs(currentPos.x - startPos.x);
      const height = Math.abs(currentPos.y - startPos.y);
      if (activeTool === "comment") {
        const commentText = prompt("Enter comment:");
        if (commentText) {
          setAnnotations((prev) => [
            ...prev,
            { id, type: activeTool, x, y, width, height, color: annotationColor, text: commentText },
          ]);
        }
      } else {
        setAnnotations((prev) => [
          ...prev,
          { id, type: activeTool, x, y, width, height, color: annotationColor },
        ]);
      }
    }
    setStartPos(null);
    setCurrentPos(null);
  };

  return (
    <div className="p-5">
      <h1 className="text-3xl font-bold text-center mb-5">PDF Annotation App</h1>
      {!pdfFile ? (
        <div
          {...getRootProps()}
          className="border-2 border-dashed border-gray-300 p-8 text-center mb-8 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <input {...getInputProps()} />
          {isDragActive ? (
            <p className="text-lg text-gray-700">Drop the PDF file here...</p>
          ) : (
            <p className="text-lg text-gray-700">
              Drag &amp; drop a PDF file here, or click to select file
            </p>
          )}
        </div>
      ) : (
        <div>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
            <button
              onClick={() => handleToolSelect("highlight")}
              className={`px-3 py-2 md:px-4 md:py-2 text-sm md:text-base rounded shadow transition-colors ${
                activeTool === "highlight"
                  ? "bg-blue-600 text-white"
                  : "bg-blue-500 text-white hover:bg-blue-600"
              }`}
            >
              Highlight
            </button>
            <button
              onClick={() => handleToolSelect("underline")}
              className={`px-3 py-2 md:px-4 md:py-2 text-sm md:text-base rounded shadow transition-colors ${
                activeTool === "underline"
                  ? "bg-blue-600 text-white"
                  : "bg-blue-500 text-white hover:bg-blue-600"
              }`}
            >
              Underline
            </button>
            <button
              onClick={() => handleToolSelect("comment")}
              className={`px-3 py-2 md:px-4 md:py-2 text-sm md:text-base rounded shadow transition-colors ${
                activeTool === "comment"
                  ? "bg-blue-600 text-white"
                  : "bg-blue-500 text-white hover:bg-blue-600"
              }`}
            >
              Add Comment
            </button>
            <button
              onClick={() => handleToolSelect("signature")}
              className={`px-3 py-2 md:px-4 md:py-2 text-sm md:text-base rounded shadow transition-colors ${
                activeTool === "signature"
                  ? "bg-blue-600 text-white"
                  : "bg-blue-500 text-white hover:bg-blue-600"
              }`}
            >
              Sign
            </button>
            <input
              type="color"
              value={annotationColor}
              onChange={handleColorChange}
              className="w-10 h-10 border border-gray-300 rounded"
            />
            <button
              onClick={exportPDF}
              className="px-3 py-2 md:px-4 md:py-2 text-sm md:text-base rounded shadow bg-green-500 text-white hover:bg-green-600 transition-colors"
            >
              Export PDF
            </button>
          </div>
          {/* PDF container */}
          <div ref={pdfContainerRef} className="relative border border-gray-300 rounded mx-auto">
            <Document file={pdfFile} onLoadSuccess={onDocumentLoadSuccess}>
              {numPages &&
                Array.from(new Array(numPages), (_, index) => (
                  <Page key={`page_${index + 1}`} pageNumber={index + 1} width={containerWidth} />
                ))}
            </Document>
            {/* Annotation overlay */}
            <div
              className="absolute inset-0 z-10"
              style={{ pointerEvents: activeTool ? "auto" : "none" }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              {isDrawing && activeTool !== "signature" && startPos && currentPos && (
                <div
                  className="absolute border-2 border-dashed border-red-500 bg-red-200/50"
                  style={{
                    left: Math.min(startPos.x, currentPos.x),
                    top: Math.min(startPos.y, currentPos.y),
                    width: Math.abs(currentPos.x - startPos.x),
                    height: Math.abs(currentPos.y - startPos.y),
                  }}
                />
              )}
              {annotations.map((ann) => {
                if (ann.type === "highlight" || ann.type === "underline") {
                  return (
                    <div
                      key={ann.id}
                      className="absolute pointer-events-none"
                      style={{
                        left: ann.x,
                        top: ann.y,
                        width: ann.width,
                        height: ann.height,
                        backgroundColor: ann.type === "highlight" ? ann.color + "55" : undefined,
                        borderBottom: ann.type === "underline" ? `4px solid ${ann.color}` : undefined,
                      }}
                    />
                  );
                } else if (ann.type === "comment") {
                  return (
                    <div
                      key={ann.id}
                      className="absolute pointer-events-none border-2 border-dashed rounded bg-white/70 p-1 overflow-hidden text-xs"
                      style={{
                        left: ann.x,
                        top: ann.y,
                        width: ann.width,
                        height: ann.height,
                      }}
                    >
                      {ann.text}
                    </div>
                  );
                } else if (ann.type === "signature" && ann.path) {
                  return (
                    <svg
                      key={ann.id}
                      className="absolute pointer-events-none"
                      style={{ top: 0, left: 0, width: "100%", height: "100%" }}
                    >
                      <polyline
                        points={ann.path.map((p) => `${p.x},${p.y}`).join(" ")}
                        stroke={ann.color}
                        strokeWidth="2"
                        fill="none"
                      />
                    </svg>
                  );
                }
                return null;
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
