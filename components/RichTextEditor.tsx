"use client";

import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { 
    Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, 
    Undo, Redo, AlignLeft, AlignCenter, AlignRight, AlignJustify,
    Table as TableIcon, Trash2, Rows, Columns
} from 'lucide-react';

interface RichTextEditorProps {
    content: string;
    onChange: (content: string) => void;
    minHeight?: number;
}

const RichTextEditor = ({ content, onChange, minHeight = 180 }: RichTextEditorProps) => {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Underline,
            TextAlign.configure({
                types: ['heading', 'paragraph'],
            }),
            Table.configure({
                resizable: true,
                HTMLAttributes: {
                    class: 'editor-table',
                },
            }),
            TableRow,
            TableHeader,
            TableCell,
        ],
        content: content,
        immediatelyRender: false,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: 'custom-editor-content focus:outline-none',
                style: `min-height: ${minHeight}px;`,
            },
        },
    });

    useEffect(() => {
        if (editor && content !== editor.getHTML()) {
            editor.commands.setContent(content, { emitUpdate: false });
        }
    }, [content, editor]);

    if (!editor) return null;

    const isActive = (typeOrAttrs: string | Record<string, unknown>, options?: Record<string, unknown>) => {
        const active = typeof typeOrAttrs === 'string'
            ? editor.isActive(typeOrAttrs, options)
            : editor.isActive('paragraph', typeOrAttrs) || editor.isActive('heading', typeOrAttrs);

        return active ? 'bg-slate-200' : 'hover:bg-slate-100';
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: '4px', padding: '10px 16px', borderBottom: '1px solid var(--color-border-light)', background: 'var(--color-surface)', flexWrap: 'wrap' }}>
                {/* Text Formatting */}
                <button onClick={() => editor.chain().focus().toggleBold().run()} className={`p-1.5 rounded transition-colors ${isActive('bold')}`} title="Kalın">
                    <Bold className="h-4 w-4 text-slate-700" />
                </button>
                <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`p-1.5 rounded transition-colors ${isActive('italic')}`} title="İtalik">
                    <Italic className="h-4 w-4 text-slate-700" />
                </button>
                <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`p-1.5 rounded transition-colors ${isActive('underline')}`} title="Altı Çizili">
                    <UnderlineIcon className="h-4 w-4 text-slate-700" />
                </button>
                
                <div style={{ width: '1px', background: 'var(--color-border-light)', margin: '0 4px' }} />

                {/* Alignment */}
                <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className={`p-1.5 rounded transition-colors ${isActive({ textAlign: 'left' })}`} title="Sola Hizala">
                    <AlignLeft className="h-4 w-4 text-slate-700" />
                </button>
                <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={`p-1.5 rounded transition-colors ${isActive({ textAlign: 'center' })}`} title="Ortala">
                    <AlignCenter className="h-4 w-4 text-slate-700" />
                </button>
                <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className={`p-1.5 rounded transition-colors ${isActive({ textAlign: 'right' })}`} title="Sağa Hizala">
                    <AlignRight className="h-4 w-4 text-slate-700" />
                </button>
                <button onClick={() => editor.chain().focus().setTextAlign('justify').run()} className={`p-1.5 rounded transition-colors ${isActive({ textAlign: 'justify' })}`} title="İki Yana Yasla">
                    <AlignJustify className="h-4 w-4 text-slate-700" />
                </button>

                <div style={{ width: '1px', background: 'var(--color-border-light)', margin: '0 4px' }} />

                {/* Lists */}
                <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`p-1.5 rounded transition-colors ${isActive('bulletList')}`} title="Madde İşaretli Liste">
                    <List className="h-4 w-4 text-slate-700" />
                </button>
                <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`p-1.5 rounded transition-colors ${isActive('orderedList')}`} title="Numaralı Liste">
                    <ListOrdered className="h-4 w-4 text-slate-700" />
                </button>

                <div style={{ width: '1px', background: 'var(--color-border-light)', margin: '0 4px' }} />

                {/* Tables */}
                <button onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} className="p-1.5 hover:bg-slate-100 rounded transition-colors flex items-center gap-1" title="Tablo Ekle">
                    <TableIcon className="h-4 w-4 text-slate-700" />
                </button>
                <button onClick={() => editor.chain().focus().addColumnBefore().run()} disabled={!editor.can().addColumnBefore()} className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-30 transition-colors" title="Sütun Ekle">
                    <Columns className="h-4 w-4 text-slate-700" />
                </button>
                <button onClick={() => editor.chain().focus().addRowAfter().run()} disabled={!editor.can().addRowAfter()} className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-30 transition-colors" title="Satır Ekle">
                    <Rows className="h-4 w-4 text-slate-700" />
                </button>
                <button onClick={() => editor.chain().focus().deleteTable().run()} disabled={!editor.can().deleteTable()} className="p-1.5 hover:bg-red-50 rounded disabled:opacity-30 transition-colors" title="Tabloyu Sil">
                    <Trash2 className="h-4 w-4 text-red-600" />
                </button>

                <div style={{ width: '1px', background: 'var(--color-border-light)', margin: '0 4px' }} />

                {/* Undo/Redo */}
                <button onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-30" title="Geri Al">
                    <Undo className="h-4 w-4 text-slate-700" />
                </button>
                <button onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-30" title="Yinele">
                    <Redo className="h-4 w-4 text-slate-700" />
                </button>
            </div>

            {/* Content Area */}
            <div style={{ padding: '14px 16px', background: '#fff', minHeight, resize: 'vertical', overflow: 'auto' }}>
                <EditorContent editor={editor} />
            </div>

            <style jsx global>{`
                .custom-editor-content p {
                    margin-bottom: 1rem;
                    line-height: 1.6;
                    color: var(--color-text-primary);
                    font-size: 0.95rem;
                }
                .custom-editor-content p.is-editor-empty:first-child::before {
                    content: attr(data-placeholder);
                    float: left;
                    color: var(--color-text-tertiary);
                    pointer-events: none;
                    height: 0;
                }
                .custom-editor-content ul {
                    list-style-type: disc;
                    padding-left: 2rem;
                    margin-bottom: 1rem;
                }
                .custom-editor-content ol {
                    list-style-type: decimal;
                    padding-left: 2rem;
                    margin-bottom: 1rem;
                }
                .custom-editor-content li {
                    margin-bottom: 0.5rem;
                    line-height: 1.5;
                }
                .custom-editor-content strong {
                    font-weight: 600;
                }
                .custom-editor-content em {
                    font-style: italic;
                }
                
                /* Tiptap Table CSS */
                .custom-editor-content table {
                    border-collapse: collapse;
                    table-layout: fixed;
                    width: 100%;
                    margin: 1rem 0;
                    overflow: hidden;
                }
                .custom-editor-content table td,
                .custom-editor-content table th {
                    border: 1px solid var(--color-border);
                    box-sizing: border-box;
                    min-width: 1em;
                    padding: 8px 12px;
                    position: relative;
                    vertical-align: top;
                }
                .custom-editor-content table th {
                    background-color: var(--color-surface-2);
                    font-weight: bold;
                    text-align: left;
                }
                .custom-editor-content table p {
                    margin: 0;
                }
            `}</style>
        </div>
    );
};

export default RichTextEditor;
