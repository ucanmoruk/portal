"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";

interface DataEntryTableProps {
    personnel: string[]; // List of analyst names
    component: string;   // Current component name (for labeling)
    initialData?: string[][]; // Optional initial data
    onDataChange: (data: string[][]) => void;
}

export function DataEntryTable({ personnel, component, initialData, onDataChange }: DataEntryTableProps) {
    // Rows x Columns grid. 
    // Default 10 rows. Columns = personnel.length
    const [grid, setGrid] = useState<string[][]>(() => {
        if (initialData && initialData.length > 0) return initialData;
        const rows = 10;
        return Array(rows).fill(null).map(() => Array(personnel.length).fill(""));
    });

    // Helper to update grid and notify parent
    const updateGrid = (newGrid: string[][]) => {
        setGrid(newGrid);
        onDataChange(newGrid);
    };

    const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
        const newGrid = [...grid];
        newGrid[rowIndex] = [...newGrid[rowIndex]]; // Copy row
        newGrid[rowIndex][colIndex] = value;
        updateGrid(newGrid);
    };

    const addRow = () => {
        updateGrid([...grid, Array(personnel.length).fill("")]);
    };

    const clearGrid = () => {
        const rows = 10;
        updateGrid(Array(rows).fill(null).map(() => Array(personnel.length).fill("")));
    };

    const removeRow = (rowIndex: number) => {
        if (grid.length <= 3) return; // Prevent removing all rows
        updateGrid(grid.filter((_, i) => i !== rowIndex));
    };

    // Handle Paste (Excel support)
    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) => {
        e.preventDefault();
        const clipboardData = e.clipboardData.getData('text');
        if (!clipboardData) return;

        // Split by newlines for rows, tabs for columns
        const rows = clipboardData.split(/\r\n|\n|\r/).filter(row => row.trim() !== "");

        const newGrid = [...grid];
        let currentRow = rowIndex;

        rows.forEach((rowString) => {
            // Expand grid if needed
            if (currentRow >= newGrid.length) {
                newGrid.push(Array(personnel.length).fill(""));
            }

            const cells = rowString.split('\t');
            let currentCol = colIndex;

            cells.forEach((cellValue) => {
                if (currentCol < personnel.length) {
                    newGrid[currentRow] = [...newGrid[currentRow]]; // ensure row copy
                    // Clean value (trim, handle comma/dot if needed, though we store string)
                    newGrid[currentRow][currentCol] = cellValue.trim();
                    currentCol++;
                }
            });
            currentRow++;
        });

        // We can't use updateGrid here easily because of useCallback dependency on 'grid' vs 'updateGrid' closure capture.
        // But since we are inside component, we can just call onDataChange directly if we include it in dependency.
        // Alternatively, use setGrid with functional update and a side effect, but that's messy.
        // Let's just call both.
        setGrid(newGrid);
        onDataChange(newGrid);
    }, [grid, personnel.length, onDataChange]);

    return (
        <div className="space-y-2">
            <div className="max-h-[500px] overflow-auto rounded-lg border border-slate-200 bg-white [&_td]:border-slate-200 [&_th]:border-slate-200 [&_tr]:border-slate-200">
                <Table>
                    <TableHeader className="sticky top-0 z-10 bg-slate-50">
                        <TableRow>
                            <TableHead className="w-[72px] text-center">#</TableHead>
                            {personnel.map((person, i) => (
                                <TableHead key={i} className="min-w-[120px] border-l border-slate-200 text-center">
                                    {person}
                                </TableHead>
                            ))}
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {grid.map((row, rowIndex) => (
                            <TableRow key={rowIndex}>
                                <TableCell className="border-r border-slate-200 bg-slate-50 text-center text-xs font-medium text-slate-600">
                                    {rowIndex + 1}
                                </TableCell>
                                {row.map((cellValue, colIndex) => (
                                    <TableCell key={colIndex} className="border-l border-slate-200 p-2">
                                        <Input
                                            className="h-9 bg-white text-center"
                                            style={{ padding: "10px" }}
                                            value={cellValue}
                                            onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                                            onPaste={(e) => handlePaste(e, rowIndex, colIndex)}
                                            placeholder="-"
                                        />
                                    </TableCell>
                                ))}
                                <TableCell className="p-1 text-center">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 text-slate-400 hover:text-red-500"
                                        onClick={() => removeRow(rowIndex)}
                                        tabIndex={-1}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: "10px", marginTop: "10px" }}>
                <Button variant="outline" size="sm" onClick={addRow} className="text-blue-600 border-blue-200 hover:bg-blue-50" style={{ padding: "10px" }}>
                    <Plus className="h-4 w-4 mr-1" /> Satır Ekle
                </Button>
                <Button variant="outline" size="sm" onClick={clearGrid} className="border-slate-200 text-slate-600 hover:bg-slate-50" style={{ padding: "10px" }}>
                    Temizle
                </Button>
            </div>
        </div>
    );
}
