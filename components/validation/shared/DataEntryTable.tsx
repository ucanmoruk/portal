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
        <div className="space-y-4">
            <div className="bg-slate-50 p-2 rounded-t-md border-b text-xs font-semibold text-slate-500 flex justify-between items-center">
                <span>{component} - Veri Girişi</span>
                <span className="text-slate-400 font-normal italic">Excel'den kopyalayıp yapıştırabilirsiniz.</span>
            </div>

            <div className="border rounded-md max-h-[500px] overflow-auto">
                <Table>
                    <TableHeader className="bg-slate-100 sticky top-0 z-10">
                        <TableRow>
                            <TableHead className="w-[50px] text-center">#</TableHead>
                            {personnel.map((person, i) => (
                                <TableHead key={i} className="min-w-[150px] text-center border-l">
                                    {person}
                                </TableHead>
                            ))}
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {grid.map((row, rowIndex) => (
                            <TableRow key={rowIndex} className="hover:bg-slate-50">
                                <TableCell className="text-center font-medium text-slate-500 text-xs">
                                    {rowIndex + 1}
                                </TableCell>
                                {row.map((cellValue, colIndex) => (
                                    <TableCell key={colIndex} className="p-0 border-l">
                                        <Input
                                            className="border-0 rounded-none h-9 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500 text-center"
                                            value={cellValue}
                                            onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                                            onPaste={(e) => handlePaste(e, rowIndex, colIndex)}
                                            placeholder="-"
                                        />
                                    </TableCell>
                                ))}
                                <TableCell className="p-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-slate-400 hover:text-red-500"
                                        onClick={() => removeRow(rowIndex)}
                                        tabIndex={-1}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <Button variant="outline" size="sm" onClick={addRow} className="w-full border-dashed text-slate-500 hover:text-blue-600 hover:border-blue-300">
                <Plus className="h-4 w-4 mr-2" /> Satır Ekle
            </Button>
        </div>
    );
}
