/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import XLSXStyle from 'xlsx-js-style';
import { Student, Subject, StudentIdentity } from './types';
import { ChevronUp, ChevronDown, Printer, UserCircle, Plus, Edit, Trash2, X, Save, LogOut, Lock, User as LucideUser, Search, Settings, LayoutDashboard, FileText, ChevronRight, ChevronLeft, Menu, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from './firebase';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, onSnapshot } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

// No server needed, data is stored in Firebase
const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

const slideIn = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3 } }
};

const Header = ({ logoUrl }: { logoUrl: string }) => (
  <div className="mb-2 double-border-bottom relative pb-1">
    <div className="flex items-center gap-6 py-1">
      <div className="shrink-0">
        {logoUrl ? (
          <img src={logoUrl} width="95" alt="Logo" className="w-22 h-22 object-contain" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-22 h-22 bg-slate-100 rounded-xl flex items-center justify-center text-[8pt] text-slate-400 font-bold border-2 border-dashed border-slate-200 uppercase">Logo</div>
        )}
      </div>
      <div className="flex-1 text-center pr-[119px]">
        <h1 className="text-[12pt] font-black uppercase leading-tight tracking-tight">YAYASAN PENDIDIKAN ISLAM AL-HIKMAH</h1>
        <h2 className="text-[14.5pt] font-black uppercase leading-tight tracking-tight">PESANTREN MODERN AL-HIKMAH</h2>
        <p className="text-[8.5pt] font-bold mt-1 text-slate-700">Jl. Al-Hikmah Kp. Pondok Jaya RT.05/01 Desa Pondok Jaya Kecamatan Sepatan</p>
        <p className="text-[8.5pt] font-bold text-slate-700">Kabupaten Tangerang Provinsi Banten</p>
      </div>
    </div>
  </div>
);

interface ReportTemplateProps {
  key?: string | number;
  student: Student;
  logoUrl: string;
  globalNamaKelas: string;
  globalTanggalRaport: string;
  globalWaliKelas: string;
  globalWaliKelasPutra?: string;
  globalWaliKelasPutri?: string;
  globalKepala: string;
  studentRankings: any[];
  autoSaveStudent: (s: Partial<Student>) => void | Promise<void>;
  setStudentsList: React.Dispatch<React.SetStateAction<Student[]>>;
}

const ReportTemplate = ({ 
  student, logoUrl, globalNamaKelas, globalTanggalRaport, 
  globalWaliKelas, globalWaliKelasPutra = '', globalWaliKelasPutri = '', globalKepala, studentRankings, 
  autoSaveStudent, setStudentsList 
}: ReportTemplateProps) => {
  const waliKelasToPrint = useMemo(() => {
    const jk = (student.identity?.jenisKelamin || '').trim().toUpperCase();
    const isPutra = jk.startsWith('L') || jk.startsWith('PUTRA');
    if (isPutra) {
      return globalWaliKelasPutra || globalWaliKelas || '..........................';
    } else {
      return globalWaliKelasPutri || globalWaliKelas || '..........................';
    }
  }, [student, globalWaliKelas, globalWaliKelasPutra, globalWaliKelasPutri]);

  const stats = useMemo(() => {
    const tulisTotal = student.subjects.reduce((sum, sub) => sum + (typeof sub.tulis?.nilai === 'number' ? sub.tulis.nilai : 0), 0);
    const lisanTotal = student.subjects.reduce((sum, sub) => sum + (typeof sub.lisan?.nilai === 'number' ? sub.lisan.nilai : 0), 0);
    const count = student.subjects.length;
    return {
      tulisTotal,
      lisanTotal,
      tulisAvg: (tulisTotal / (count || 1)).toFixed(2),
      lisanAvg: (lisanTotal / (count || 1)).toFixed(2)
    };
  }, [student]);

  const groupedSubjects = useMemo<Record<string, Subject[]>>(() => {
    const groups: Record<string, Subject[]> = {};
    student.subjects.forEach(s => {
      const cat = s.category || 'LAINNYA';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    });
    return groups;
  }, [student]);

  return (
    <div className="report-container shadow-2xl rounded-sm print:shadow-none print:bg-white p-10 print:p-0 mb-20 print:mb-0">
      {/* PAGE 1: COVER */}
      <section className="page flex flex-col items-center justify-start pt-16 text-center">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="w-72 h-72 object-contain mb-12" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-72 h-72 border-4 border-dashed border-slate-200 rounded-3xl flex items-center justify-center mb-12 mx-auto">
            <span className="text-slate-300 font-extrabold text-2xl uppercase tracking-widest px-4">LOGO PESANTREN</span>
          </div>
        )}
        <h1 className="text-5xl font-black uppercase mb-3 tracking-tighter text-slate-900">Laporan Hasil Belajar</h1>
        <h2 className="text-2xl font-bold uppercase mb-12 text-slate-500 tracking-widest">Pondok Pesantren Modern Al-Hikmah</h2>
        
        <div className="relative w-full max-w-lg py-8 px-6 bg-white/50 backdrop-blur-sm p-8 rounded-3xl border border-slate-200/50 shadow-sm mt-4">
          <div className="relative py-4 space-y-8">
            <div className="flex flex-col items-center">
              <span className="text-[9pt] font-black uppercase tracking-[0.4em] text-slate-400 mb-2">Nama Santri</span>
              <span className="text-2xl font-black text-slate-900 tracking-tighter">{student.name}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col items-center border-r border-slate-100">
                <span className="text-[8pt] font-black uppercase tracking-[0.3em] text-slate-400 mb-1">NIS/NISN</span>
                <span className="text-base font-black text-slate-800">{student.nomorInduk}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[8pt] font-black uppercase tracking-[0.3em] text-slate-400 mb-1">Tingkat Kelas</span>
                <span className="text-base font-black text-slate-800 uppercase">{globalNamaKelas || student.class}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-20 mb-8 space-y-4 break-inside-avoid">
          <p className="font-black uppercase text-2xl underline underline-offset-[12px] decoration-[3px] tracking-[0.3em] text-slate-900">SEMESTER {student.semester}</p>
          <div className="h-4"></div>
          <p className="font-extrabold uppercase text-xl tracking-[0.2em] text-slate-500">TAHUN PELAJARAN {student.tahunPelajaran}</p>
        </div>
      </section>

      {/* PAGE 2: IDENTITAS SANTRI */}
      <section className="page flex flex-col pt-8 pb-6 px-12 text-[10pt] font-sans">
        <h1 className="text-center text-[12pt] font-black uppercase mb-8 tracking-wider text-slate-800">KETERANGAN TENTANG DIRI PESERTA DIDIK</h1>
        <div className="flex-1 space-y-0.5">
          <table className="w-full border-collapse">
            <tbody>
              {[
                { id: "1.", label: 'Nama Peserta Didik (Lengkap)', value: student.name },
                { id: "2.", label: 'NIS / NISN', value: student.identity?.nisNisn },
                { id: "3.", label: 'Tempat, Tanggal Lahir', value: student.identity?.tempatTanggalLahir },
                { id: "4.", label: 'Jenis Kelamin', value: student.identity?.jenisKelamin },
                { id: "5.", label: 'Agama', value: student.identity?.agama },
                { id: "6.", label: 'Status dalam Keluarga', value: student.identity?.statusDalamKeluarga },
                { id: "7.", label: 'Anak ke', value: student.identity?.anakKe },
                { id: "8.", label: 'Alamat Peserta Didik', value: student.identity?.alamatPesertaDidik },
                { label: '', isSpacer: true },
                { id: "9.", label: 'Nomor Telepon Rumah', value: student.identity?.teleponRumah },
                { id: "10.", label: 'Sekolah Asal', value: student.identity?.sekolahAsal },
                { id: "11.", label: 'Diterima di pesantren ini', isHeader: true },
                { label: 'Di kelas', indent: true, value: student.identity?.diterimaDiKelas },
                { label: 'Pada tanggal', indent: true, value: student.identity?.diterimaPadaTanggal },
                { id: "12.", label: 'Nama Orang Tua', isHeader: true },
                { label: 'a. Ayah', indent: true, value: student.identity?.namaAyah },
                { label: 'b. Ibu', indent: true, value: student.identity?.namaIbu },
                { id: "13.", label: 'Alamat Orang Tua', value: student.identity?.alamatOrangTua },
                { label: '', isSpacer: true },
                { id: "14.", label: 'Nomor Telepon Rumah', value: student.identity?.teleponOrangTua },
                { label: 'Pekerjaan Orang Tua', isHeader: true },
                { label: 'a. Ayah', indent: true, value: student.identity?.pekerjaanAyah },
                { label: 'b. Ibu', indent: true, value: student.identity?.pekerjaanIbu },
                { id: "15.", label: 'Nama Wali Peserta Didik', value: student.identity?.namaWali },
                { id: "16.", label: 'Alamat Wali Peserta Didik', value: student.identity?.alamatWali },
                { label: 'Nomor Telepon Rumah', indent: true, value: student.identity?.teleponWali },
                { id: "17.", label: 'Pekerjaan Wali Peserta Didik', value: student.identity?.pekerjaanWali },
              ].map((row, idx) => {
                if (row.isSpacer) return <tr key={`spacer-${idx}`}><td colSpan={4} className="h-2"></td></tr>;
                return (
                  <tr key={idx} className="align-top">
                    <td className="w-8 py-1 font-bold">{(row as any).id || ''}</td>
                    <td className={`w-[45%] py-1 ${row.indent ? 'pl-6' : ''} ${row.isHeader ? 'font-black' : 'font-medium'}`}>
                      {row.label}
                    </td>
                    <td className="w-4 py-1 text-center">:</td>
                    <td className={`py-1 border-b border-dotted border-slate-300 min-h-[1.5em] ${!row.isHeader ? 'font-black' : ''}`}>
                      {row.value}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-end mt-8 px-12">
          <div className="w-[3cm] h-[4cm] border-2 border-slate-900 flex items-center justify-center text-center text-[7pt] text-slate-400 font-bold bg-slate-50 uppercase tracking-tighter leading-tight shrink-0 overflow-hidden relative group">
            {student.photoUrl ? (
              <img src={student.photoUrl} alt="Foto Santri" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <span className="p-3">Pas Foto<br/>3 x 4 cm</span>
            )}
          </div>
          <div className="text-center w-80 mb-2">
            <p className="mb-0 text-[10pt]">Tangerang, {globalTanggalRaport}</p>
            <p className="font-black uppercase text-[10pt]">Kepala Kepesantrenan,</p>
            <div className="h-20"></div>
            <p className="font-black text-[10pt] border-b-2 border-black inline-block min-w-[200px]">{globalKepala || ''}</p>
          </div>
        </div>
      </section>

      {/* PAGE 3: NILAI */}
      <section className="page">
        <Header logoUrl={logoUrl} />
        <StudentInfo student={student} globalNamaKelas={globalNamaKelas} />
        <h3 className="font-bold mb-3 uppercase text-lg border-b-2 border-black inline-block mt-4">A. NILAI TULIS & LISAN</h3>
        <table className="table-raport w-full text-center mt-2">
          <thead>
            <tr>
              <th rowSpan={2} className="w-[4%]">No</th>
              <th rowSpan={2} className="w-[45%]">Mata Pelajaran</th>
              <th rowSpan={2} className="w-[7%]">KKM</th>
              <th colSpan={2} className="w-[22%]">Nilai Tulis</th>
              <th colSpan={2} className="w-[22%]">Nilai Lisan</th>
            </tr>
            <tr>
              <th className="w-[11%] text-[8pt] italic">SKOR</th>
              <th className="w-[11%] text-[8pt] italic">HURUF</th>
              <th className="w-[11%] text-[8pt] italic">SKOR</th>
              <th className="w-[11%] text-[8pt] italic">HURUF</th>
            </tr>
          </thead>
          <tbody>
            {(Object.entries(groupedSubjects) as [string, Subject[]][]).map(([category, subs], catIdx) => (
              <React.Fragment key={category}>
                <tr className="category-row">
                  <td colSpan={7} className="font-bold uppercase py-2 bg-slate-50 border-y-2 border-black">
                    <span className="ml-2">{catIdx + 1}. {category}</span>
                  </td>
                </tr>
                {subs.map((sub, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td className="text-left font-medium">{sub.name}</td>
                    <td>{sub.kkm}</td>
                    <td className="p-0">
                      <input 
                        type="number" min="0" max="100" 
                        className="w-full h-full py-2 bg-transparent text-center font-mono font-bold no-print focus:bg-blue-50/50 outline-none transition-all"
                        value={sub.tulis?.nilai ?? ''} 
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          const newSubs = [...(student.subjects || [])];
                          const subIdx = newSubs.findIndex(s => s.name === sub.name);
                          if (subIdx !== -1) {
                            newSubs[subIdx] = { ...newSubs[subIdx], tulis: { nilai: val, huruf: getHuruf(val) } };
                            const updated = {...student, subjects: newSubs};
                            setStudentsList(prev => prev.map(s => s.id === updated.id ? updated : s));
                            autoSaveStudent(updated);
                          }
                        }}
                      />
                      <span className="hidden print:inline">{sub.tulis?.nilai ?? '-'}</span>
                    </td>
                    <td className="font-bold">{sub.tulis?.huruf ?? '-'}</td>
                    <td className="p-0">
                      <input 
                        type="number" min="0" max="100" 
                        className="w-full h-full py-2 bg-transparent text-center font-mono font-bold no-print focus:bg-blue-50/50 outline-none transition-all"
                        value={sub.lisan?.nilai ?? ''} 
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          const newSubs = [...(student.subjects || [])];
                          const subIdx = newSubs.findIndex(s => s.name === sub.name);
                          if (subIdx !== -1) {
                            newSubs[subIdx] = { ...newSubs[subIdx], lisan: { nilai: val, huruf: getHuruf(val) } };
                            const updated = {...student, subjects: newSubs};
                            setStudentsList(prev => prev.map(s => s.id === updated.id ? updated : s));
                            autoSaveStudent(updated);
                          }
                        }}
                      />
                      <span className="hidden print:inline">{sub.lisan?.nilai ?? '-'}</span>
                    </td>
                    <td className="font-bold">{sub.lisan?.huruf ?? '-'}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
            <tr className="font-bold bg-slate-100 border-t-2 border-black h-10">
              <td colSpan={3} className="uppercase text-center">Jumlah Skor</td>
              <td>{stats.tulisTotal}</td>
              <td></td>
              <td>{stats.lisanTotal}</td>
              <td></td>
            </tr>
            <tr className="font-bold bg-slate-100 h-10">
              <td colSpan={3} className="uppercase text-center">Rata-rata Skor</td>
              <td>{stats.tulisAvg}</td>
              <td></td>
              <td>{stats.lisanAvg}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <div className="signature-section mt-12 text-[10pt] flex justify-between items-start px-4 page-break-inside-avoid">
          <div className="signature-box flex flex-col items-center flex-1 text-center leading-relaxed">
            <p className="font-medium">Mengetahui,</p>
            <p className="font-bold">Orang Tua/Wali Santri</p>
            <div className="h-28"></div>
            <p className="font-black border-b-2 border-black inline-block min-w-[200px] text-base h-8 whitespace-nowrap text-center">
              {student.identity?.namaAyah || student.identity?.namaWali || '..........................'}
            </p>
          </div>
          <div className="signature-box flex flex-col items-center flex-1 text-center leading-relaxed">
            <p className="font-medium text-right w-full pr-10 italic">Tangerang, {globalTanggalRaport}</p>
            <p className="font-bold">Wali Kelas,</p>
            <div className="h-28"></div>
            <p className="font-black border-b-2 border-black inline-block min-w-[200px] text-[11pt] h-8 whitespace-nowrap text-center">
              {waliKelasToPrint}
            </p>
          </div>
        </div>
      </section>

      {/* PAGE 4: SIKAP */}
      <section className="page flex flex-col">
        <Header logoUrl={logoUrl} />
        <StudentInfo student={student} globalNamaKelas={globalNamaKelas} />
        <h3 className="font-bold mb-3 uppercase text-lg border-b-2 border-black inline-block">B. SIKAP</h3>
        <table className="table-raport mb-6 text-[10pt]">
          <thead>
            <tr className="bg-slate-50 h-10">
              <th className="w-[30%]">ASPEK PENILAIAN</th>
              <th className="w-[70%]">DESKRIPSI CAPAIAN</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-bold text-center py-8">Sikap Spiritual</td>
              <td className="relative px-6 py-6 bg-slate-50/30">
                <textarea 
                  className="w-full min-h-[100px] bg-transparent outline-none resize-none no-print focus:bg-blue-50/50 p-2 rounded-xl transition-all leading-relaxed"
                  placeholder="Tulis deskripsi sikap spiritual..."
                  value={student.behavior.spiritual || ''}
                  onChange={e => {
                      const updated = {...student, behavior: {...student.behavior, spiritual: e.target.value}};
                      setStudentsList(prev => prev.map(s => s.id === updated.id ? updated : s));
                      autoSaveStudent(updated);
                  }}
                />
                <div className="hidden print:block whitespace-pre-wrap">{student.behavior.spiritual || '-'}</div>
              </td>
            </tr>
            <tr>
              <td className="font-bold text-center py-8">Sikap Sosial</td>
              <td className="relative px-6 py-6 bg-slate-50/30">
                <textarea 
                  className="w-full min-h-[100px] bg-transparent outline-none resize-none no-print focus:bg-blue-50/50 p-2 rounded-xl transition-all leading-relaxed"
                  placeholder="Tulis deskripsi sikap sosial..."
                  value={student.behavior.social || ''}
                  onChange={e => {
                      const updated = {...student, behavior: {...student.behavior, social: e.target.value}};
                      setStudentsList(prev => prev.map(s => s.id === updated.id ? updated : s));
                      autoSaveStudent(updated);
                  }}
                />
                <div className="hidden print:block whitespace-pre-wrap">{student.behavior.social || '-'}</div>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="signature-section mt-auto text-[10pt] flex justify-between items-start px-4 page-break-inside-avoid pb-8">
          <div className="signature-box flex flex-col items-center flex-1 text-center leading-relaxed">
            <p className="font-medium">Mengetahui,</p>
            <p className="font-bold">Orang Tua/Wali Santri</p>
            <div className="h-28"></div>
            <p className="font-black border-b-2 border-black inline-block min-w-[200px] text-base h-8 whitespace-nowrap text-center">
              {student.identity?.namaAyah || student.identity?.namaWali || '..........................'}
            </p>
          </div>
          <div className="signature-box flex flex-col items-center flex-1 text-center leading-relaxed">
            <p className="font-medium text-right w-full pr-10 italic">Tangerang, {globalTanggalRaport}</p>
            <p className="font-bold">Wali Kelas,</p>
            <div className="h-28"></div>
            <p className="font-black border-b-2 border-black inline-block min-w-[200px] text-[11pt] h-8 whitespace-nowrap text-center">
              {waliKelasToPrint}
            </p>
          </div>
        </div>
      </section>

      {/* PAGE 5: EKSTRA & ABSENSI */}
      <section className="page flex flex-col">
        <Header logoUrl={logoUrl} />
        <StudentInfo student={student} globalNamaKelas={globalNamaKelas} />
        
        <h3 className="font-bold mb-3 uppercase text-lg border-b-2 border-black inline-block">C. EKSTRAKURIKULER</h3>
        <table className="table-raport mb-12 text-[10pt]">
          <thead>
            <tr className="bg-slate-50 h-10">
              <th className="w-[40%] text-center">KEGIATAN / PROGRAM</th>
              <th className="w-[60%] text-center">KETERANGAN PERKEMBANGAN</th>
            </tr>
          </thead>
          <tbody>
            {student.extracurriculars.length > 0 ? student.extracurriculars.map((ex, idx) => (
              <tr key={idx}>
                <td className="font-medium pl-4">{ex.activity}</td>
                <td className="pl-4">{ex.note}</td>
              </tr>
            )) : (
              <tr><td colSpan={2} className="text-center italic py-4 text-slate-400">Tidak ada data kegiatan ekstrakurikuler yang diikuti</td></tr>
            )}
          </tbody>
        </table>

        <h3 className="font-bold mb-3 uppercase text-lg border-b-2 border-black inline-block">D. KEHADIRAN</h3>
        <table className="table-raport mb-6 text-[10pt] w-[300px]">
          <thead>
            <tr className="bg-slate-50 h-10">
              <th className="w-[60%]">KETERANGAN</th>
              <th className="w-[40%]">JUMLAH (HARI)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="pl-4">Sakit</td><td className="p-0"><input type="number" className="w-full text-center py-2 bg-transparent font-bold no-print focus:bg-blue-50/50 outline-none" value={student.attendance.sakit} onChange={e => { const updated = {...student, attendance: {...student.attendance, sakit: parseInt(e.target.value) || 0}}; setStudentsList(prev => prev.map(s => s.id === updated.id ? updated : s)); autoSaveStudent(updated); }} /><span className="hidden print:inline">{student.attendance.sakit}</span></td></tr>
            <tr><td className="pl-4">Izin</td><td className="p-0"><input type="number" className="w-full text-center py-2 bg-transparent font-bold no-print focus:bg-blue-50/50 outline-none" value={student.attendance.izin} onChange={e => { const updated = {...student, attendance: {...student.attendance, izin: parseInt(e.target.value) || 0}}; setStudentsList(prev => prev.map(s => s.id === updated.id ? updated : s)); autoSaveStudent(updated); }} /><span className="hidden print:inline">{student.attendance.izin}</span></td></tr>
            <tr><td className="pl-4">Tanpa Keterangan</td><td className="p-0"><input type="number" className="w-full text-center py-2 bg-transparent font-bold no-print focus:bg-blue-50/50 outline-none" value={student.attendance.alpha} onChange={e => { const updated = {...student, attendance: {...student.attendance, alpha: parseInt(e.target.value) || 0}}; setStudentsList(prev => prev.map(s => s.id === updated.id ? updated : s)); autoSaveStudent(updated); }} /><span className="hidden print:inline">{student.attendance.alpha}</span></td></tr>
          </tbody>
        </table>
  
        <div className="signature-section mt-12 text-[10pt] flex justify-between items-start px-4 page-break-inside-avoid">
          <div className="signature-box flex flex-col items-center flex-1 text-center leading-relaxed">
            <p className="font-medium">Mengetahui,</p>
            <p className="font-bold">Orang Tua/Wali Santri</p>
            <div className="h-28"></div>
            <p className="font-black border-b-2 border-black inline-block min-w-[200px] text-base h-8 whitespace-nowrap">
              {student.identity?.namaAyah || student.identity?.namaWali || '..........................'}
            </p>
          </div>
          <div className="signature-box flex flex-col items-center flex-1 text-center leading-relaxed">
            <p className="font-medium text-right w-full pr-10">Tangerang, {globalTanggalRaport}</p>
            <p className="font-bold">Wali Kelas,</p>
            <div className="h-28"></div>
            <p className="font-black border-b-2 border-black inline-block min-w-[200px] text-[11pt] h-8 whitespace-nowrap">
              {waliKelasToPrint}
            </p>
          </div>
        </div>
      </section>

      {/* LEDGER */}
      <section className="page border-t-2 mt-8 print:hidden">
        <Header logoUrl={logoUrl} />
        <div className="text-center mb-10 mt-6">
          <h1 className="text-2xl font-black uppercase tracking-widest text-slate-800">Ledger Perkembangan Nilai Santri</h1>
          <h2 className="text-lg font-bold uppercase text-slate-500 mt-1">Kelas {student.class} • TA {student.tahunPelajaran}</h2>
        </div>
        
        <table className="table-raport text-[10pt]">
          <thead>
            <tr className="bg-slate-50 h-12">
              <th className="w-12">No</th>
              <th>Nama Lengkap Santri</th>
              <th className="w-24">Skor Rerata</th>
              <th className="w-24">Ranking</th>
            </tr>
          </thead>
          <tbody>
            {studentRankings.map((s: any) => (
              <tr key={s.id} className={s.id === student.id ? 'bg-blue-50/50 font-bold border-x-4 border-blue-600' : 'hover:bg-slate-50/50 transition-colors'}>
                <td className="text-center font-medium font-mono">{s.rank}</td>
                <td className="pl-6">{s.name}</td>
                <td className="text-center font-mono">{s.avg.toFixed(2)}</td>
                <td className="text-center">
                  <span className={`inline-block w-8 h-8 leading-8 rounded-full ${s.rank <= 3 ? 'bg-amber-100 text-amber-700 font-black ring-2 ring-amber-200' : 'font-bold text-slate-700'}`}>
                    {s.rank}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
};

const StudentInfo = ({ student, globalNamaKelas }: { student: Student, globalNamaKelas?: string }) => (
  <div className="mb-2">
    <table className="table-header w-full text-[9pt]">
      <tbody>
        <tr>
          <td className="w-[18%]">Nama Santri</td>
          <td className="w-[2%]">:</td>
          <td className="w-[40%] font-bold">{student.name}</td>
          <td className="w-[15%]">Kelas</td>
          <td className="w-[2%]">:</td>
          <td className="w-[23%] font-bold">{globalNamaKelas || student.class}</td>
        </tr>
        <tr>
          <td>NIS/NISN</td>
          <td>:</td>
          <td className="font-bold">{student.nomorInduk}</td>
          <td>Semester</td>
          <td>:</td>
          <td className="relative">
            <span className="font-bold">{student.semester}</span>
            {student.semester === "GANJIL" && (
              <div className="absolute -inset-x-2 -inset-y-1 border-2 border-green-700 pointer-events-none opacity-80 rounded-sm"></div>
            )}
          </td>
        </tr>
        <tr>
          <td>Nomor Urut Absen</td>
          <td>:</td>
          <td className="font-bold">{student.noUrut}</td>
          <td>Tahun Pelajaran</td>
          <td>:</td>
          <td className="font-bold">{student.tahunPelajaran}</td>
        </tr>
      </tbody>
    </table>
  </div>
);

const DEFAULT_AVAILABLE_SUBJECTS = [
  { name: "Asasul Mubtadiin Fi Ilmi Nahwi", category: "BAHASA ARAB", kkm: 40 },
  { name: "Mutammimah", category: "BAHASA ARAB", kkm: 40 },
  { name: "Asasul Mubtadiin Fi Ilmi Shorfi", category: "BAHASA ARAB", kkm: 40 },
  { name: "Durusullughah", category: "BAHASA ARAB", kkm: 40 },
  { name: "Qiraatul Kutub", category: "BAHASA ARAB", kkm: 40 },
  { name: "Imla'", category: "BAHASA ARAB", kkm: 40 },
  { name: "Al-Qur'an", category: "AGAMA", kkm: 40 },
  { name: "Tajwid", category: "AGAMA", kkm: 40 },
  { name: "Fiqih Qouliyah", category: "AGAMA", kkm: 40 },
  { name: "Fiqih Fi'liyah", category: "AGAMA", kkm: 40 },
  { name: "Grammar", category: "BAHASA INGGRIS", kkm: 40 },
  { name: "Stories For You", category: "BAHASA INGGRIS", kkm: 40 },
  { name: "Speaking", category: "BAHASA INGGRIS", kkm: 40 },
  { name: "Dictation", category: "BAHASA INGGRIS", kkm: 40 },
  { name: "Vocabularies", category: "BAHASA INGGRIS", kkm: 40 }
];

const StudentDashboard = ({ student, studentRankings, onEdit, onPrint, onShowSheet }: { 
  student: Student, 
  studentRankings: any[], 
  onEdit: () => void, 
  onPrint: () => void,
  onShowSheet: () => void
}) => {
  const ranking = studentRankings.find(r => r.id === student.id);
  const tulisTotal = student.subjects.reduce((sum, sub) => sum + (typeof sub.tulis?.nilai === 'number' ? sub.tulis.nilai : 0), 0);
  const lisanTotal = student.subjects.reduce((sum, sub) => sum + (typeof sub.lisan?.nilai === 'number' ? sub.lisan.nilai : 0), 0);
  const avg = ((tulisTotal + lisanTotal) / (student.subjects.length * 2 || 1)).toFixed(2);

  return (
    <div className="w-full max-w-[210mm] space-y-6 no-print">
       <div className="bg-white p-6 md:p-10 rounded-[40px] shadow-sm border border-slate-100 flex flex-col md:flex-row items-center gap-8">
          <div className="w-40 h-40 bg-blue-50 rounded-[40px] flex items-center justify-center text-blue-600 shadow-inner shrink-0 overflow-hidden bg-white border-2 border-dashed border-slate-100 relative group">
             {student.photoUrl ? (
               <img src={student.photoUrl} alt={student.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
             ) : (
               <UserCircle size={100} className="opacity-10" />
             )}
          </div>
          <div className="flex-1 text-center md:text-left">
             <h2 className="text-4xl font-black text-slate-800 uppercase tracking-tight mb-3 leading-tight">{student.name}</h2>
             <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                <span className="px-4 py-2 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-slate-200 shadow-sm">NI: {student.nomorInduk || '-'}</span>
                <span className="px-4 py-2 bg-blue-50 text-blue-600 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-blue-100 shadow-sm">KELAS {student.class}</span>
                <span className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-emerald-100 shadow-sm">{student.semester} SYAWAL/RAMADHAN</span>
             </div>
          </div>
          <div className="flex flex-col gap-3 shrink-0">
             <button onClick={onEdit} className="flex items-center gap-4 px-6 py-4 bg-slate-100 text-slate-800 rounded-2xl hover:bg-slate-200 transition-all font-black text-xs uppercase tracking-widest w-full">
                <Edit size={20} className="text-slate-400" /> EDIT DATA
             </button>
             <button onClick={onPrint} className="flex items-center gap-4 px-6 py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all font-black text-xs uppercase tracking-widest w-full shadow-xl shadow-blue-100">
                <Printer size={20} /> CETAK RAPORT
             </button>
             <button onClick={onShowSheet} className="text-[10px] font-black text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-widest underline underline-offset-4 decoration-slate-200">
                LIHAT PREVIEW LEMBAR
             </button>
          </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex items-center gap-6">
             <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 shadow-lg shadow-amber-50"><LayoutDashboard size={28} /></div>
             <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Skor Rerata</p>
                <p className="text-3xl font-black text-slate-800">{avg}</p>
             </div>
          </div>
          <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex items-center gap-6">
             <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shadow-lg shadow-blue-50"><Settings size={28} /></div>
             <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ranking</p>
                <p className="text-3xl font-black text-slate-800">{ranking?.rank || '-'}</p>
             </div>
          </div>
          <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex items-center gap-6">
             <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shadow-lg shadow-emerald-50"><FileText size={28} /></div>
             <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Absensi</p>
                <p className="text-3xl font-black text-slate-800">{student.attendance.sakit + student.attendance.izin + student.attendance.alpha} <span className="text-xs text-slate-400 font-bold uppercase">Hari</span></p>
             </div>
          </div>
       </div>

       <div className="bg-white p-10 rounded-[50px] border border-slate-100 shadow-sm">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-3">
               <div className="w-2 h-8 bg-blue-600 rounded-full"></div>
               Review Nilai Akademik
            </h3>
            <button onClick={onEdit} className="text-[10px] font-black text-blue-600 hover:text-blue-700 transition-colors uppercase tracking-widest px-4 py-2 bg-blue-50 rounded-xl">Edit Nilai</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
             {student.subjects.map((sub, i) => (
                <div key={i} className="flex items-center justify-between p-5 bg-slate-50 border border-slate-100 rounded-3xl group hover:border-blue-200 hover:bg-white transition-all">
                   <div>
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1 leading-none">{sub.category}</p>
                      <p className="text-sm font-bold text-slate-700 uppercase group-hover:text-blue-600 transition-colors leading-none">{sub.name}</p>
                   </div>
                   <div className="flex items-center gap-4">
                      <div className="text-center bg-white px-3 py-2 rounded-xl border border-slate-100 shadow-sm">
                         <p className="text-[8px] font-black text-slate-400 uppercase leading-none mb-1">Tulis</p>
                         <p className="text-xs font-black text-blue-600">{sub.tulis?.nilai || 0}</p>
                      </div>
                      <div className="text-center bg-white px-3 py-2 rounded-xl border border-slate-100 shadow-sm">
                         <p className="text-[8px] font-black text-slate-400 uppercase leading-none mb-1">Lisan</p>
                         <p className="text-xs font-black text-emerald-600">{sub.lisan?.nilai || 0}</p>
                      </div>
                   </div>
                </div>
             ))}
          </div>
       </div>
    </div>
  );
};


const getHuruf = (nilai: number | string) => {
  if (typeof nilai !== 'number') return "-";
  if (nilai >= 80) return "A";
  if (nilai >= 60) return "B";
  if (nilai >= 40) return "C";
  return "D";
};

export default function App() {
  const CLASSES = ['7 MTs', '7 SMP', '8 MTs', '8 SMP', '9 MTs', '9 SMP', '10 SMA', '11 SMA', '12 SMA', 'ALUMNI'];

  const [selectedClass, setSelectedClass] = useState<string>(() => {
    return localStorage.getItem('selected_class') || '10 SMA';
  });
  const [studentsList, setStudentsList] = useState<Student[]>([]);
  const [globalWaliKelas, setGlobalWaliKelas] = useState<string>('');
  const [globalWaliKelasPutra, setGlobalWaliKelasPutra] = useState<string>('');
  const [globalWaliKelasPutri, setGlobalWaliKelasPutri] = useState<string>('');
  const [globalNamaKelas, setGlobalNamaKelas] = useState<string>('');
  const [globalTanggalRaport, setGlobalTanggalRaport] = useState<string>('');
  const [globalKepala, setGlobalKepala] = useState<string>('');
  const [globalTanggalKenaikan, setGlobalTanggalKenaikan] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [isBulkGradesOpen, setIsBulkGradesOpen] = useState(false);
  const [isBulkIdentityOpen, setIsBulkIdentityOpen] = useState(false);
  const [isBulkExtraOpen, setIsBulkExtraOpen] = useState(false);
  const [isBulkBehaviorOpen, setIsBulkBehaviorOpen] = useState(false);
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false); // keep for single student grid if needed, or remove later
  const [studentsToPrint, setStudentsToPrint] = useState<Student[]>([]);
  const [bulkData, setBulkData] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Partial<Student> | null>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'grades' | 'identity' | 'extra'>('basic');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [selectedSubjectIndex, setSelectedSubjectIndex] = useState(0);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [showSheetPreview, setShowSheetPreview] = useState(false);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, isEditingModal = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      if (isEditingModal && editingStudent) {
        setEditingStudent({ ...editingStudent, photoUrl: base64String });
      } else if (selectedStudent) {
        const studentId = selectedStudent.id;
        setStudentsList(prev => prev.map(s => s.id === studentId ? { ...s, photoUrl: base64String } : s));
        setDoc(doc(db, 'students', studentId), { photoUrl: base64String, updatedAt: new Date().toISOString() }, { merge: true });
      }
    };
    reader.readAsDataURL(file);
  };

  // Close sidebar on mobile when student changes
  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
    // Also reset sheet preview when changing student
    setShowSheetPreview(false);
  }, [currentIndex]);

  // Fetch configs from Firebase
  useEffect(() => {
    // Config keys to listen to
    const configKeys = [
      `wali_kelas_${selectedClass}`,
      `wali_kelas_putra_${selectedClass}`,
      `wali_kelas_putri_${selectedClass}`,
      `nama_kelas_${selectedClass}`,
      `tanggal_raport_${selectedClass}`,
      `kepala_kepasentrenan_${selectedClass}`,
      `tanggal_kenaikan_${selectedClass}`,
      'al_hikmah_custom_logo'
    ];

    const unsubscribers = configKeys.map(key => {
      return onSnapshot(doc(db, 'configs', key), (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.data().value;
          if (key === `wali_kelas_${selectedClass}`) setGlobalWaliKelas(val);
          if (key === `wali_kelas_putra_${selectedClass}`) setGlobalWaliKelasPutra(val);
          if (key === `wali_kelas_putri_${selectedClass}`) setGlobalWaliKelasPutri(val);
          if (key === `nama_kelas_${selectedClass}`) setGlobalNamaKelas(val);
          if (key === `tanggal_raport_${selectedClass}`) setGlobalTanggalRaport(val);
          if (key === `kepala_kepasentrenan_${selectedClass}`) setGlobalKepala(val);
          if (key === `tanggal_kenaikan_${selectedClass}`) setGlobalTanggalKenaikan(val);
          if (key === 'al_hikmah_custom_logo') setLogoUrl(val);
        } else {
          // Defaults if not in Firebase
          if (key.startsWith('tanggal_raport_')) setGlobalTanggalRaport('20 Desember 2025');
          if (key.startsWith('tanggal_kenaikan_')) setGlobalTanggalKenaikan('21 Juni 2026');
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `configs/${key}`);
      });
    });

    return () => unsubscribers.forEach(unsub => unsub());
  }, [selectedClass]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        try {
          await setDoc(doc(db, 'configs', 'al_hikmah_custom_logo'), { value: base64, updatedAt: new Date().toISOString() });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'configs/al_hikmah_custom_logo');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const classes = CLASSES;

  // Initialize and fetch students from Firebase
  useEffect(() => {
    if (selectedClass) {
      fetchStudents(selectedClass);
    } else {
      setIsLoading(false);
    }
  }, [selectedClass]);

  const fetchStudents = async (className: string) => {
    setIsLoading(true);
    try {
      const q = query(collection(db, 'students'), where('class', '==', className));
      const querySnapshot = await getDocs(q);
      const students = querySnapshot.docs.map(doc => {
        const data = { id: doc.id, ...doc.data() as Student };
        // Migration: Rename Dialogue/Speaking to Speaking, Update KKM to 40, & Update Grade Scale
        if (data.subjects) {
          data.subjects = data.subjects.map(s => {
            let updated = s;
            if (s.name === 'Dialogue/Speaking') updated = { ...updated, name: 'Speaking' };
            if (updated.kkm !== 40) updated = { ...updated, kkm: 40 };
            
            // Recalculate letters based on new scale
            if (updated.tulis) updated.tulis.huruf = getHuruf(updated.tulis.nilai);
            if (updated.lisan) updated.lisan.huruf = getHuruf(updated.lisan.nilai);
            
            return updated;
          });
        }
        return data;
      });
      
      // Sort by noUrut
      students.sort((a, b) => (a.noUrut || 0) - (b.noUrut || 0));
      setStudentsList(students);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const autoSaveStudent = async (student: Partial<Student>) => {
    if (!student.id) return;
    setSaveStatus('saving');
    try {
      await setDoc(doc(db, 'students', student.id), { ...student, updatedAt: new Date().toISOString() }, { merge: true });
      setSaveStatus('saved');
    } catch (e) {
      setSaveStatus('error');
    }
  };

  const handleSelectClass = (className: string) => {
    setSelectedClass(className);
    localStorage.setItem('selected_class', className);
    setCurrentIndex(0);
  };

  const handleUpdateGlobalWaliKelas = async (val: string) => {
    setGlobalWaliKelas(val);
    if (selectedClass) {
      try {
        await setDoc(doc(db, 'configs', `wali_kelas_${selectedClass}`), { value: val, updatedAt: new Date().toISOString() });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `configs/wali_kelas_${selectedClass}`);
      }
    }
  };

  const handleUpdateGlobalWaliKelasPutra = async (val: string) => {
    setGlobalWaliKelasPutra(val);
    if (selectedClass) {
      try {
        await setDoc(doc(db, 'configs', `wali_kelas_putra_${selectedClass}`), { value: val, updatedAt: new Date().toISOString() });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `configs/wali_kelas_putra_${selectedClass}`);
      }
    }
  };

  const handleUpdateGlobalWaliKelasPutri = async (val: string) => {
    setGlobalWaliKelasPutri(val);
    if (selectedClass) {
      try {
        await setDoc(doc(db, 'configs', `wali_kelas_putri_${selectedClass}`), { value: val, updatedAt: new Date().toISOString() });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `configs/wali_kelas_putri_${selectedClass}`);
      }
    }
  };

  const handleUpdateGlobalNamaKelas = async (val: string) => {
    setGlobalNamaKelas(val);
    if (selectedClass) {
      try {
        await setDoc(doc(db, 'configs', `nama_kelas_${selectedClass}`), { value: val, updatedAt: new Date().toISOString() });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `configs/nama_kelas_${selectedClass}`);
      }
    }
  };

  const handleUpdateGlobalTanggalRaport = async (val: string) => {
    setGlobalTanggalRaport(val);
    if (selectedClass) {
      try {
        await setDoc(doc(db, 'configs', `tanggal_raport_${selectedClass}`), { value: val, updatedAt: new Date().toISOString() });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `configs/tanggal_raport_${selectedClass}`);
      }
    }
  };

  const handleUpdateGlobalKepala = async (val: string) => {
    setGlobalKepala(val);
    if (selectedClass) {
      try {
        await setDoc(doc(db, 'configs', `kepala_kepasentrenan_${selectedClass}`), { value: val, updatedAt: new Date().toISOString() });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `configs/kepala_kepasentrenan_${selectedClass}`);
      }
    }
  };

  const handleUpdateGlobalTanggalKenaikan = async (val: string) => {
    setGlobalTanggalKenaikan(val);
    if (selectedClass) {
      try {
        await setDoc(doc(db, 'configs', `tanggal_kenaikan_${selectedClass}`), { value: val, updatedAt: new Date().toISOString() });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `configs/tanggal_kenaikan_${selectedClass}`);
      }
    }
  };

  const handleProcessPromotion = async () => {
    if (!selectedClass || studentsList.length === 0) return;
    
    const isEvenSemester = studentsList[0]?.semester === 'GENAP';
    if (!isEvenSemester) {
      alert('Proses kenaikan/kelulusan hanya bisa dilakukan di akhir SEMESTER GENAP.');
      return;
    }

    if (!confirm(`Apakah Anda yakin ingin memproses kenaikan/kelulusan untuk seluruh santri di kelas ${selectedClass}? \n\nData nilai akan direset dan tahun pelajaran akan diperbarui.`)) {
      return;
    }

    const nextTahunPelajaran = (yearStr: string) => {
      const parts = yearStr.split('/');
      if (parts.length === 2) {
        const start = parseInt(parts[0]) + 1;
        const end = parseInt(parts[1]) + 1;
        return `${start}/${end}`;
      }
      return yearStr;
    };

    const getNextClass = (current: string) => {
      if (current.includes('9') || current.includes('12')) return 'ALUMNI';
      
      const mapping: Record<string, string> = {
        '7 MTs': '8 MTs',
        '8 MTs': '9 MTs',
        '7 SMP': '8 SMP',
        '8 SMP': '9 SMP',
        '10 SMA': '11 SMA',
        '11 SMA': '12 SMA'
      };
      return mapping[current] || current;
    };

    setIsLoading(true);
    try {
      for (const student of studentsList) {
        const nextClass = getNextClass(student.class);
        const nextYear = nextTahunPelajaran(student.tahunPelajaran);
        const isGraduating = nextClass === 'ALUMNI';
        
        const resetSubjects = student.subjects.map(s => ({
          ...s,
          tulis: { nilai: 0, huruf: '-' },
          lisan: { nilai: 0, huruf: '-' }
        }));

        const updatedStudent: Partial<Student> = {
          class: nextClass,
          semester: isGraduating ? student.semester : 'GANJIL',
          tahunPelajaran: isGraduating ? student.tahunPelajaran : nextYear,
          subjects: isGraduating ? student.subjects : resetSubjects,
          attendance: isGraduating ? student.attendance : { sakit: 0, izin: 0, alpha: 0 },
          behavior: isGraduating ? student.behavior : { spiritual: '', social: '' },
          extracurriculars: isGraduating ? student.extracurriculars : [],
          updatedAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'students', student.id), updatedStudent, { merge: true });
      }
      alert(`Berhasil memproses kenaikan/kelulusan untuk kelas ${selectedClass}.`);
      fetchStudents(selectedClass);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'students');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-save effect: Updates UI in real-time, sinks to server with debounce
  useEffect(() => {
    if (!editingStudent || !editingStudent.id) return;

    // REAL-TIME UI UPDATE: Update local list immediately as user types
    setStudentsList(prev => prev.map(s => s.id === editingStudent.id ? { ...s, ...editingStudent } as Student : s));

    const timer = setTimeout(() => {
      autoSaveStudent(editingStudent);
    }, 500);

    return () => clearTimeout(timer);
  }, [editingStudent]);

  const handleCloseModal = async () => {
    if (editingStudent && editingStudent.id && saveStatus === 'saving') {
      await autoSaveStudent(editingStudent);
    }
    setIsModalOpen(false);
    setEditingStudent(null);
    setSaveStatus('idle');
  };

  const handleBulkAddStudents = async (namesString: string) => {
    const names = namesString.split('\n').map(n => n.trim()).filter(n => n !== '');
    if (names.length === 0) return;

    const newStudents: Student[] = names.map((name, index) => ({
      id: Math.random().toString(36).substr(2, 9),
      name: name.toUpperCase(),
      nomorInduk: '',
      noUrut: (studentsList.length + index + 1),
      class: selectedClass || '10 SMA',
      semester: 'GANJIL',
      tahunPelajaran: '2025/2026',
      subjects: (studentsList.length > 0 ? studentsList[0].subjects : DEFAULT_AVAILABLE_SUBJECTS).map(s => ({ 
        name: s.name, 
        category: s.category, 
        kkm: s.kkm, 
        tulis: { nilai: 0, huruf: '-' }, 
        lisan: { nilai: 0, huruf: '-' } 
      })),
      behavior: { spiritual: '', social: '' },
      attendance: { sakit: 0, izin: 0, alpha: 0 },
      extracurriculars: [],
      identity: {
        nisNisn: '', tempatTanggalLahir: '', jenisKelamin: '', agama: 'ISLAM',
        statusDalamKeluarga: '', anakKe: '', alamatPesertaDidik: '', teleponRumah: '',
        sekolahAsal: '', diterimaDiKelas: '', diterimaPadaTanggal: '',
        namaAyah: '', namaIbu: '', alamatOrangTua: '', teleponOrangTua: '',
        pekerjaanAyah: '', pekerjaanIbu: '', namaWali: '', alamatWali: '',
        teleponWali: '', pekerjaanWali: ''
      }
    }));

    try {
      for (const s of newStudents) {
        await setDoc(doc(db, 'students', s.id), { ...s, updatedAt: new Date().toISOString() });
      }
      if (selectedClass) fetchStudents(selectedClass);
      setIsBulkAddOpen(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'students');
    }
  };

  const handleBulkUpdateGrades = async (studentId: string, subIdx: number, type: 'tulis' | 'lisan', value: number) => {
    const student = studentsList.find(s => s.id === studentId);
    if (student) {
      const newSubs = [...student.subjects];
      newSubs[subIdx] = {
        ...newSubs[subIdx],
        [type]: { nilai: value, huruf: getHuruf(value) }
      };
      
      const updated = { ...student, subjects: newSubs };
      setStudentsList(prev => prev.map(s => s.id === studentId ? updated : s));
      try {
        await setDoc(doc(db, 'students', studentId), { subjects: newSubs, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `students/${studentId}`);
      }
    }
  };

  const handleBulkUpdateExtra = async (studentId: string, activityIdx: number, key: 'activity' | 'note', value: string) => {
    const student = studentsList.find(s => s.id === studentId);
    if (student) {
      const newExtras = [...(student.extracurriculars || [])];
      while (newExtras.length <= activityIdx) {
        newExtras.push({ activity: '', note: '' });
      }

      newExtras[activityIdx] = {
        ...newExtras[activityIdx],
        [key]: value
      };
      
      const updated = { ...student, extracurriculars: newExtras };
      setStudentsList(prev => prev.map(s => s.id === studentId ? updated : s));
      try {
        await setDoc(doc(db, 'students', studentId), { extracurriculars: newExtras, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `students/${studentId}`);
      }
    }
  };

  const handleBulkUpdateBehavior = async (studentId: string, type: 'spiritual' | 'social', value: string) => {
    const student = studentsList.find(s => s.id === studentId);
    if (student) {
      const newBehavior = {
        ...student.behavior,
        [type]: value
      };
      
      const updated = { ...student, behavior: newBehavior };
      setStudentsList(prev => prev.map(s => s.id === studentId ? updated : s));
      try {
        await setDoc(doc(db, 'students', studentId), { behavior: newBehavior, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `students/${studentId}`);
      }
    }
  };

  const handleBulkUpdateIdentity = async (studentId: string, key: string, value: string) => {
    const student = studentsList.find(s => s.id === studentId);
    if (student) {
      const currentIdentity = student.identity || {
        nisNisn: '', tempatTanggalLahir: '', jenisKelamin: '', agama: 'ISLAM',
        statusDalamKeluarga: '', anakKe: '', alamatPesertaDidik: '', teleponRumah: '',
        sekolahAsal: '', diterimaDiKelas: '', diterimaPadaTanggal: '',
        namaAyah: '', namaIbu: '', alamatOrangTua: '', teleponOrangTua: '',
        pekerjaanAyah: '', pekerjaanIbu: '', namaWali: '', alamatWali: '',
        teleponWali: '', pekerjaanWali: ''
      };
      
      const newIdentity = {
        ...currentIdentity,
        [key]: value
      };
      
      const updated = { ...student, identity: newIdentity };
      setStudentsList(prev => prev.map(s => s.id === studentId ? updated : s));
      try {
        await setDoc(doc(db, 'students', studentId), { identity: newIdentity, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `students/${studentId}`);
      }
    }
  };

  const handleClearClass = () => {
    setSelectedClass('');
    localStorage.removeItem('selected_class');
    setStudentsList([]);
  };

  const filteredStudents = useMemo(() => {
    if (!searchTerm) return studentsList;
    return studentsList.filter(s => 
      String(s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
      String(s.nomorInduk || '').includes(searchTerm)
    );
  }, [studentsList, searchTerm]);

  const selectedStudent = useMemo(() => {
    return filteredStudents[currentIndex] || filteredStudents[0];
  }, [filteredStudents, currentIndex]);

  const studentRankings = useMemo(() => {
    const list = studentsList.map(s => {
      const tulisSum = s.subjects.reduce((sum, sub) => sum + (typeof sub.tulis?.nilai === 'number' ? sub.tulis.nilai : 0), 0);
      const lisanSum = s.subjects.reduce((sum, sub) => sum + (typeof sub.lisan?.nilai === 'number' ? sub.lisan.nilai : 0), 0);
      const avg = (tulisSum + lisanSum) / (s.subjects.length * 2);
      return { id: s.id, name: s.name, avg };
    });
    return list.sort((a, b) => b.avg - a.avg).map((s, idx) => ({ ...s, rank: idx + 1 }));
  }, [studentsList]);

  const handleSaveStudent = async (e?: React.FormEvent, stayOpen: boolean = false) => {
    if (e) e.preventDefault();
    if (!editingStudent) return;

    const isEdit = !!editingStudent.id;
    const studentId = isEdit ? editingStudent.id! : Math.random().toString(36).substr(2, 9);

    const payload = {
      ...editingStudent,
      id: studentId,
      noUrut: isEdit ? editingStudent.noUrut : (studentsList.length + 1),
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'students', studentId), payload, { merge: true });
      
      if (!isEdit) {
        setSearchTerm('');
        setCurrentIndex(studentsList.length);
      }
      
      if (selectedClass) fetchStudents(selectedClass);
      
      if (!stayOpen) {
        setIsModalOpen(false);
        setEditingStudent(null);
        setSaveStatus('idle');
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `students/${studentId}`);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus data santri ini?')) {
      try {
        await deleteDoc(doc(db, 'students', id));
        if (selectedClass) fetchStudents(selectedClass);
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `students/${id}`);
      }
    }
  };

  const openAddModal = () => {
    setActiveTab('basic');
    setEditingStudent({
      name: '',
      nomorInduk: '',
      class: selectedClass || '7',
      semester: 'GANJIL',
      tahunPelajaran: '2025/2026',
      subjects: DEFAULT_AVAILABLE_SUBJECTS.map(s => ({
        ...s,
        tulis: { nilai: 0, huruf: '-' },
        lisan: { nilai: 0, huruf: '-' }
      })),
      behavior: { spiritual: '', social: '' },
      attendance: { sakit: 0, izin: 0, alpha: 0 },
      extracurriculars: [],
      waliKelas: '',
      identity: {
        nisNisn: '',
        tempatTanggalLahir: '',
        jenisKelamin: '',
        agama: 'Islam',
        statusDalamKeluarga: '',
        anakKe: '',
        alamatPesertaDidik: '',
        teleponRumah: '',
        sekolahAsal: '',
        diterimaDiKelas: '',
        diterimaPadaTanggal: '',
        namaAyah: '',
        namaIbu: '',
        alamatOrangTua: '',
        teleponOrangTua: '',
        pekerjaanAyah: '',
        pekerjaanIbu: '',
        namaWali: '',
        alamatWali: '',
        teleponWali: '',
        pekerjaanWali: ''
      }
    });
    setIsModalOpen(true);
  };

  const openEditModal = () => {
    setEditingStudent({ ...selectedStudent });
    setIsModalOpen(true);
  };

  const [isSyncing, setIsSyncing] = useState(false);

  const exportGradesToExcel = () => {
    if (studentsList.length === 0) return;
    
    const subjects = studentsList[0].subjects.map(s => s.name);
    const data = studentsList.map(s => {
      const row: any = {
        'NO URUT': s.noUrut,
        'NAMA SANTRI': s.name,
        'NIS/NISN': s.nomorInduk
      };
      
      s.subjects.forEach(sub => {
        row[`${sub.name} (TULIS)`] = sub.tulis?.nilai || 0;
        row[`${sub.name} (LISAN)`] = sub.lisan?.nilai || 0;
      });
      
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "NILAI");
    XLSX.writeFile(wb, `NILAI_KELAS_${selectedClass.replace(' ', '_')}.xlsx`);
  };

  const importGradesFromExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      const updatedStudents = [...studentsList];
      
      for (const row of jsonData) {
        const nameInExcel = row['NAMA SANTRI'] ? String(row['NAMA SANTRI']).trim() : '';
        if (!nameInExcel) continue;

        const excelNis = row['NIS/NISN'] ? String(row['NIS/NISN']).trim() : '';
        const studentIdx = updatedStudents.findIndex(s => {
          const matchByName = String(s.name || '').trim().toUpperCase() === nameInExcel.toUpperCase();
          const matchByNis = excelNis !== '' && s.nomorInduk && String(s.nomorInduk).trim() === excelNis;
          return matchByNis || matchByName;
        });

        if (studentIdx !== -1) {
          const student = updatedStudents[studentIdx];
          const newSubs = student.subjects.map(sub => {
            const tulisVal = row[`${sub.name} (TULIS)`];
            const lisanVal = row[`${sub.name} (LISAN)`];
            return {
              ...sub,
              tulis: typeof tulisVal !== 'undefined' ? { nilai: parseInt(tulisVal) || 0, huruf: getHuruf(parseInt(tulisVal) || 0) } : sub.tulis,
              lisan: typeof lisanVal !== 'undefined' ? { nilai: parseInt(lisanVal) || 0, huruf: getHuruf(parseInt(lisanVal) || 0) } : sub.lisan,
            };
          });
          
          updatedStudents[studentIdx] = { ...student, subjects: newSubs };
          // Batching saves would be better, but for now we do individual saves or we can implement a batch save
          await setDoc(doc(db, 'students', student.id), { subjects: newSubs, updatedAt: new Date().toISOString() }, { merge: true });
        }
      }
      
      setStudentsList(updatedStudents);
      alert('Berhasil mengimpor nilai dari Excel');
    };
    reader.readAsArrayBuffer(file);
  };

  const exportIdentityToExcel = () => {
    const fields: { label: string; key?: string; isMain?: boolean; isName?: boolean }[] = [
      { label: 'NO' },
      { label: 'NAMA SANTRI', isName: true },
      { label: 'NIS/NISN (UTAMA)', key: 'nomorInduk', isMain: true },
      { label: 'NIS / NISN (IDENTITAS)', key: 'nisNisn' },
      { label: 'Tempat, Tanggal Lahir', key: 'tempatTanggalLahir' },
      { label: 'Jenis Kelamin', key: 'jenisKelamin' },
      { label: 'Agama', key: 'agama' },
      { label: 'Status dalam Keluarga', key: 'statusDalamKeluarga' },
      { label: 'Anak ke-', key: 'anakKe' },
      { label: 'Alamat Peserta Didik', key: 'alamatPesertaDidik' },
      { label: 'Nomor Telepon Rumah', key: 'teleponRumah' },
      { label: 'Sekolah Asal', key: 'sekolahAsal' },
      { label: 'Di Pesantren Diterima di Kelas', key: 'diterimaDiKelas' },
      { label: 'Diterima (Tanggal)', key: 'diterimaPadaTanggal' },
      { label: 'Nama Ayah', key: 'namaAyah' },
      { label: 'Nama Ibu', key: 'namaIbu' },
      { label: 'Alamat Orang Tua', key: 'alamatOrangTua' },
      { label: 'Nomor Telepon Orang Tua', key: 'teleponOrangTua' },
      { label: 'Pekerjaan Ayah', key: 'pekerjaanAyah' },
      { label: 'Pekerjaan Ibu', key: 'pekerjaanIbu' },
      { label: 'Nama Wali', key: 'namaWali' },
      { label: 'Alamat Wali', key: 'alamatWali' },
      { label: 'Telepon Wali', key: 'teleponWali' },
      { label: 'Pekerjaan Wali', key: 'pekerjaanWali' }
    ];

    const dataRows = filteredStudents.length > 0 ? filteredStudents.map((s, index) => {
      const row: any = {};
      fields.forEach(f => {
        if (f.label === 'NO') {
          row[f.label] = index + 1;
        } else if (f.isName) {
          row[f.label] = s.name;
        } else if (f.isMain) {
          row[f.label] = (s as any)[f.key!] || '';
        } else {
          row[f.label] = (s.identity as any)?.[f.key!] || '';
        }
      });
      return row;
    }) : [fields.reduce((acc: any, f) => ({ ...acc, [f.label]: '' }), {})];

    // Add extra empty rows if it's a template (filteredStudents.length === 0)
    if (filteredStudents.length === 0) {
      for (let i = 0; i < 20; i++) {
        dataRows.push(fields.reduce((acc: any, f) => ({ ...acc, [f.label]: '' }), {}));
      }
    }

    const ws = XLSX.utils.json_to_sheet(dataRows);
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

    // Define styles
    const headerStyle = {
      fill: { fgColor: { rgb: "00B050" } }, // Green
      font: { color: { rgb: "FFFFFF" }, bold: true },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { auto: 1 } },
        bottom: { style: "thin", color: { auto: 1 } },
        left: { style: "thin", color: { auto: 1 } },
        right: { style: "thin", color: { auto: 1 } }
      }
    };

    const bodyStyle = {
      fill: { fgColor: { rgb: "FFFF00" } }, // Yellow
      alignment: { vertical: "center" },
      border: {
        top: { style: "thin", color: { auto: 1 } },
        bottom: { style: "thin", color: { auto: 1 } },
        left: { style: "thin", color: { auto: 1 } },
        right: { style: "thin", color: { auto: 1 } }
      }
    };

    // Apply styles
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const headerAddress = XLSX.utils.encode_cell({ r: range.s.r, c: C });
      if (ws[headerAddress]) {
        ws[headerAddress].s = headerStyle;
      }

      for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) {
          ws[cellAddress] = { t: 's', v: '' };
        }
        ws[cellAddress].s = bodyStyle;
      }
    }

    // Set column widths
    ws['!cols'] = [
      { wch: 5 },  // NO
      { wch: 30 }, // NAMA SANTRI
      { wch: 20 }, // NIS/NISN (UTAMA)
      { wch: 20 }, // NIS / NISN (IDENTITAS)
      { wch: 25 }, // Tempat, Tanggal Lahir
      { wch: 15 }, // Jenis Kelamin
      { wch: 12 }, // Agama
      { wch: 20 }, // Status dalam Keluarga
      { wch: 8 },  // Anak ke-
      { wch: 40 }, // Alamat Peserta Didik
      { wch: 20 }, // Nomor Telepon Rumah
      { wch: 25 }, // Sekolah Asal
      { wch: 25 }, // Di Pesantren Diterima di Kelas
      { wch: 20 }, // Diterima (Tanggal)
      { wch: 25 }, // Nama Ayah
      { wch: 25 }, // Nama Ibu
      { wch: 40 }, // Alamat Orang Tua
      { wch: 20 }, // Nomor Telepon Orang Tua
      { wch: 20 }, // Pekerjaan Ayah
      { wch: 20 }, // Pekerjaan Ibu
      { wch: 25 }, // Nama Wali
      { wch: 40 }, // Alamat Wali
      { wch: 20 }, // Telepon Wali
      { wch: 20 }  // Pekerjaan Wali
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "IDENTITAS");
    XLSXStyle.writeFile(wb, `IDENTITAS_KELAS_${selectedClass.replace(' ', '_')}.xlsx`);
  };

  const importIdentityFromExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      const updatedStudents = [...studentsList];
      const newStudentsToFirestore: Student[] = [];
      
      const fields: { label: string; key?: keyof StudentIdentity | 'nomorInduk'; isMain?: boolean; isName?: boolean }[] = [
        { label: 'NIS/NISN (UTAMA)', key: 'nomorInduk', isMain: true },
        { label: 'NIS / NISN (IDENTITAS)', key: 'nisNisn' },
        { label: 'Tempat, Tanggal Lahir', key: 'tempatTanggalLahir' },
        { label: 'Jenis Kelamin', key: 'jenisKelamin' },
        { label: 'Agama', key: 'agama' },
        { label: 'Status dalam Keluarga', key: 'statusDalamKeluarga' },
        { label: 'Anak ke-', key: 'anakKe' },
        { label: 'Alamat Peserta Didik', key: 'alamatPesertaDidik' },
        { label: 'Nomor Telepon Rumah', key: 'teleponRumah' },
        { label: 'Sekolah Asal', key: 'sekolahAsal' },
        { label: 'Di Pesantren Diterima di Kelas', key: 'diterimaDiKelas' },
        { label: 'Diterima (Tanggal)', key: 'diterimaPadaTanggal' },
        { label: 'Nama Ayah', key: 'namaAyah' },
        { label: 'Nama Ibu', key: 'namaIbu' },
        { label: 'Alamat Orang Tua', key: 'alamatOrangTua' },
        { label: 'Nomor Telepon Orang Tua', key: 'teleponOrangTua' },
        { label: 'Pekerjaan Ayah', key: 'pekerjaanAyah' },
        { label: 'Pekerjaan Ibu', key: 'pekerjaanIbu' },
        { label: 'Nama Wali', key: 'namaWali' },
        { label: 'Alamat Wali', key: 'alamatWali' },
        { label: 'Telepon Wali', key: 'teleponWali' },
        { label: 'Pekerjaan Wali', key: 'pekerjaanWali' }
      ];

      for (const row of jsonData) {
        const nameInExcel = row['NAMA SANTRI'] ? String(row['NAMA SANTRI']).trim() : '';
        if (!nameInExcel) continue;

        const excelNis = row['NIS/NISN (UTAMA)'] ? String(row['NIS/NISN (UTAMA)']).trim() : '';
        const studentIdx = updatedStudents.findIndex(s => {
          const matchByName = String(s.name || '').trim().toUpperCase() === nameInExcel.toUpperCase();
          const matchByNis = excelNis !== '' && s.nomorInduk && String(s.nomorInduk).trim() === excelNis;
          return matchByNis || matchByName;
        });
        
        let targetStudent: Student;
        let isNew = false;

        if (studentIdx !== -1) {
          targetStudent = { ...updatedStudents[studentIdx], name: nameInExcel }; // Update name with Excel casing
          updatedStudents[studentIdx] = targetStudent;
        } else {
          isNew = true;
          targetStudent = {
            id: Math.random().toString(36).substr(2, 9),
            name: nameInExcel,
            nomorInduk: '',
            noUrut: updatedStudents.length + 1,
            class: selectedClass,
            semester: 'GANJIL',
            tahunPelajaran: '2025/2026',
            subjects: (updatedStudents.length > 0 ? updatedStudents[0].subjects : DEFAULT_AVAILABLE_SUBJECTS).map(s => ({ 
              name: s.name, 
              category: s.category, 
              kkm: s.kkm, 
              tulis: { nilai: 0, huruf: '-' }, 
              lisan: { nilai: 0, huruf: '-' } 
            })),
            behavior: { spiritual: '', social: '' },
            attendance: { sakit: 0, izin: 0, alpha: 0 },
            extracurriculars: [],
            identity: {
              nisNisn: '', tempatTanggalLahir: '', jenisKelamin: '', agama: 'ISLAM',
              statusDalamKeluarga: '', anakKe: '', alamatPesertaDidik: '', teleponRumah: '',
              sekolahAsal: '', diterimaDiKelas: '', diterimaPadaTanggal: '',
              namaAyah: '', namaIbu: '', alamatOrangTua: '', teleponOrangTua: '',
              pekerjaanAyah: '', pekerjaanIbu: '', namaWali: '', alamatWali: '',
              teleponWali: '', pekerjaanWali: ''
            }
          };
          updatedStudents.push(targetStudent);
        }

        const newIdentity = { ...(targetStudent.identity || {}) } as any;
        let mainNomorInduk = targetStudent.nomorInduk;

        fields.forEach(f => {
          if (typeof row[f.label] !== 'undefined' && row[f.label] !== null) {
            if (f.isMain) {
              mainNomorInduk = String(row[f.label]);
            } else if (!f.isName && f.key) {
              newIdentity[f.key] = String(row[f.label]);
            }
          }
        });
        
        const finalStudent = { ...targetStudent, nomorInduk: mainNomorInduk, identity: newIdentity, updatedAt: new Date().toISOString() };
        
        if (isNew) {
          await setDoc(doc(db, 'students', finalStudent.id), finalStudent);
        } else {
          await setDoc(doc(db, 'students', finalStudent.id), { name: finalStudent.name, nomorInduk: mainNomorInduk, identity: newIdentity, updatedAt: new Date().toISOString() }, { merge: true });
        }
        
        // Update the local list as well
        const localIdx = updatedStudents.findIndex(s => s.id === finalStudent.id);
        if (localIdx !== -1) updatedStudents[localIdx] = finalStudent;
      }
      
      setStudentsList(updatedStudents);
      alert('Berhasil mengimpor identitas dari Excel');
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSyncSubjects = async () => {
    if (studentsList.length < 2) return;
    if (!confirm('Ini akan menyamakan daftar mata pelajaran SEMUA santri mengikuti santri pertama. Data nilai santri lain akan tetap ada jika nama mata pelajarannya sama. Lanjutkan?')) return;
    
    setIsSyncing(true);
    const templateSubjects = studentsList[0].subjects.map(s => ({ ...s, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } }));
    
    try {
      for (const student of studentsList) {
        const newSubs = templateSubjects.map(ts => {
          const existing = student.subjects.find(s => s.name === ts.name);
          return existing ? { ...ts, tulis: existing.tulis, lisan: existing.lisan } : ts;
        });
        
        await setDoc(doc(db, 'students', student.id), { subjects: newSubs, updatedAt: new Date().toISOString() }, { merge: true });
      }
      if (selectedClass) fetchStudents(selectedClass);
      alert('Sinkronisasi Mata Pelajaran Berhasil!');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'students');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePrint = () => {
    if (!selectedStudent) return;
    setStudentsToPrint([selectedStudent]);
    window.scrollTo(0, 0);
    setTimeout(() => {
      window.print();
      setStudentsToPrint([]);
    }, 1000);
  };

  const handlePrintAll = () => {
    if (filteredStudents.length === 0) return;
    setStudentsToPrint(filteredStudents);
    window.scrollTo(0, 0);
    setTimeout(() => {
      window.print();
      setStudentsToPrint([]);
    }, 1000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Memuat Data...</p>
        </motion.div>
      </div>
    );
  }

  if (!selectedClass) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="max-w-4xl w-full bg-white rounded-3xl shadow-[0_20px_50px_rgba(8,112,184,0.1)] overflow-hidden border border-blue-50"
        >
          <div className="bg-gradient-to-br from-blue-700 to-blue-900 p-12 text-center text-white relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-transparent"></div>
            </div>
            <div className="relative z-10">
              <div className="bg-white/20 w-32 h-32 rounded-3xl rotate-12 flex items-center justify-center mx-auto mb-6 backdrop-blur-md border border-white/30 shadow-2xl overflow-hidden p-4">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-contain -rotate-12" />
                ) : (
                  <div className="text-white/50 text-xs font-black uppercase -rotate-12">No Logo</div>
                )}
              </div>
              <h1 className="text-3xl font-black tracking-tight uppercase">SISTEM RAPORT AL-HIKMAH</h1>
              <p className="text-blue-100/80 text-sm mt-2 font-medium tracking-widest uppercase">Silahkan Pilih Tingkat Kelas</p>
            </div>
            <button 
              className="absolute top-6 right-6 p-3 bg-white/10 opacity-0 pointer-events-none rounded-2xl transition-all text-white border border-white/10"
            >
              <LogOut size={20} />
            </button>
          </div>
          
          <div className="p-12">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              {classes.map((cls) => (
                <motion.button
                  key={cls}
                  whileHover={{ scale: 1.05, translateY: -4 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleSelectClass(cls)}
                  className="group relative overflow-hidden bg-slate-50 border-2 border-slate-100 hover:border-blue-500 hover:bg-white p-8 rounded-[32px] transition-all flex flex-col items-center gap-4 shadow-sm hover:shadow-xl hover:shadow-blue-100"
                >
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-3xl font-black text-slate-400 group-hover:text-blue-600 transition-colors shadow-sm group-hover:shadow-md">
                    {cls}
                  </div>
                  <span className="text-xs font-black text-slate-400 group-hover:text-slate-800 uppercase tracking-widest transition-colors">KELAS {cls}</span>
                  <div className="absolute top-0 right-0 w-12 h-12 bg-blue-600/5 rounded-bl-full translate-x-6 -translate-y-6 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform"></div>
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row h-screen overflow-hidden print:h-auto print:overflow-visible print:block">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200 no-print shrink-0">
        <button 
          onClick={handleClearClass}
          className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
        >
          <div className="w-8 h-8 rounded-lg overflow-hidden p-1 bg-slate-50 border border-slate-100 flex items-center justify-center">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" /> : <Settings size={14} className="text-slate-300" />}
          </div>
          <span className="text-xs font-black text-slate-700 uppercase">RAPORT {selectedClass}</span>
        </button>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl">
          {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Sidebar Controls */}
      <AnimatePresence>
        {(isSidebarOpen || (typeof window !== 'undefined' && window.innerWidth >= 768)) && (
            <motion.aside 
              initial={{ x: -288 }}
              animate={{ x: 0 }}
              exit={{ x: -288 }}
              className={`fixed inset-y-0 left-0 z-[150] w-72 bg-white border-r border-slate-200 overflow-y-auto no-print h-screen shadow-2xl flex flex-col pt-6 px-4 md:sticky md:block md:shadow-none md:translate-x-0 print:hidden ${isSidebarOpen ? 'block' : 'hidden md:flex'}`}
            >
        <div className="flex items-center justify-between mb-8 px-2">
          <button 
            onClick={handleClearClass}
            className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
          >
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-100 overflow-hidden p-1">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <Settings size={16} className="text-slate-300" />
              )}
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-700 uppercase tracking-tight leading-none mb-1">RA RAPORTS</h2>
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest leading-none">AL-HIKMAH CLOUD</p>
            </div>
          </button>
          <div className="flex items-center gap-1">
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleClearClass} 
              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
              title="Ubah Kelas"
            >
              <ChevronLeft size={18} />
            </motion.button>
          </div>
        </div>

        <div className="space-y-6 flex-1">
          {/* Section: Students List */}
          <div>
            <h3 className="text-[10px] uppercase font-black text-slate-400 mb-3 ml-2 flex items-center gap-2">
              <LucideUser size={12} /> Data Santri
            </h3>
            
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all"
                placeholder="Cari santri..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            {filteredStudents.length > 0 ? (
              <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
                {filteredStudents.map((s, idx) => (
                  <button 
                    key={s.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group ${currentIndex === idx ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'hover:bg-slate-50 text-slate-600'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${currentIndex === idx ? 'bg-white' : 'bg-slate-300'}`}></div>
                      <span className="text-xs font-bold truncate max-w-[140px]">{s.name}</span>
                    </div>
                    {currentIndex === idx ? <ChevronRight size={14} /> : <div className="w-1.5 h-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-400 rounded-full"></div>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="bg-slate-50 rounded-xl p-4 text-center border border-dashed border-slate-200">
                <p className="text-[10px] text-slate-400 font-medium">Tidak ada data santri</p>
              </div>
            )}
          </div>

          {/* Section: Actions */}
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <button onClick={openAddModal} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-100 hover:translate-y-[-1px]">
              <Plus size={16} /> TAMBAH SANTRI
            </button>
            
            <button 
              onClick={openEditModal} 
              disabled={filteredStudents.length === 0}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white p-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-100 hover:translate-y-[-1px] disabled:opacity-50 disabled:shadow-none"
            >
              <Edit size={16} /> EDIT DATA
            </button>

            <button 
              onClick={() => handleDeleteStudent(selectedStudent.id)} 
              disabled={filteredStudents.length === 0}
              className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 p-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <Trash2 size={16} /> HAPUS DATA
            </button>
          </div>
        </div>

        <div className="mt-8 px-2 space-y-4">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 border-dashed">
            <h3 className="text-slate-400 text-[10px] font-black tracking-[0.2em] mb-3 uppercase flex items-center gap-2">
              <Settings size={12} /> SETTING RAPORT
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Nama Kelas</label>
                <input 
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-bold text-slate-700"
                  placeholder="X (SEPULUH)..."
                  value={globalNamaKelas}
                  onChange={e => handleUpdateGlobalNamaKelas(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Tanggal Raport</label>
                <input 
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-bold text-slate-700"
                  placeholder="20 DESEMBER 2025..."
                  value={globalTanggalRaport}
                  onChange={e => handleUpdateGlobalTanggalRaport(e.target.value)}
                />
              </div>
               <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Wali Kelas Santri Putra</label>
                <input 
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-bold text-slate-700"
                  placeholder="NAMA WALI PUTRA..."
                  value={globalWaliKelasPutra}
                  onChange={e => handleUpdateGlobalWaliKelasPutra(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Wali Kelas Santri Putri</label>
                <input 
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-bold text-slate-700"
                  placeholder="NAMA WALI PUTRI..."
                  value={globalWaliKelasPutri}
                  onChange={e => handleUpdateGlobalWaliKelasPutri(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Kepala Kepesantrenan</label>
                <input 
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-bold text-slate-700"
                  placeholder="NAMA KEPALA..."
                  value={globalKepala}
                  onChange={e => handleUpdateGlobalKepala(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Tgl Kenaikan/Kelulusan</label>
                <input 
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-bold text-slate-700"
                  placeholder="21 JUNI 2026..."
                  value={globalTanggalKenaikan}
                  onChange={e => handleUpdateGlobalTanggalKenaikan(e.target.value)}
                />
              </div>
              <button 
                onClick={handleProcessPromotion}
                className="w-full mt-2 py-3 bg-red-50 text-red-600 rounded-xl text-[10px] font-black uppercase hover:bg-red-100 transition-all border border-red-100 shadow-sm"
              >
                Proses Kenaikan/Lulus
              </button>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 border-dashed">
            <h3 className="text-slate-400 text-[10px] font-black tracking-[0.2em] mb-3 uppercase flex items-center gap-2">
              <FileText size={12} /> INPUT MASSAL (KELAS)
            </h3>
            <div className="flex flex-col gap-2">
              <button 
                onClick={() => setIsBulkAddOpen(true)}
                className="flex items-center justify-between w-full px-4 py-2.5 bg-white text-slate-600 rounded-xl hover:bg-slate-50 transition-all border border-slate-200 text-[9px] font-black uppercase"
              >
                <span className="flex items-center gap-2"><Plus size={14} /> Input Data Santri</span>
              </button>
              <button 
                onClick={() => setIsBulkGradesOpen(true)}
                className="flex items-center justify-between w-full px-4 py-2.5 bg-white text-slate-600 rounded-xl hover:bg-slate-50 transition-all border border-slate-200 text-[9px] font-black uppercase"
              >
                <span className="flex items-center gap-2"><LayoutDashboard size={14} /> Input Nilai Massal</span>
              </button>
              <button 
                onClick={() => setIsBulkIdentityOpen(true)}
                className="flex items-center justify-between w-full px-4 py-2.5 bg-white text-slate-600 rounded-xl hover:bg-slate-50 transition-all border border-slate-200 text-[9px] font-black uppercase"
              >
                <span className="flex items-center gap-2"><UserCircle size={14} /> Input Identitas Massal</span>
              </button>
              <button 
                onClick={() => setIsBulkExtraOpen(true)}
                className="flex items-center justify-between w-full px-4 py-2.5 bg-white text-slate-600 rounded-xl hover:bg-slate-50 transition-all border border-slate-200 text-[9px] font-black uppercase"
              >
                <span className="flex items-center gap-2"><Plus size={14} /> Input Ekstra Massal</span>
              </button>
              <button 
                onClick={() => setIsBulkBehaviorOpen(true)}
                className="flex items-center justify-between w-full px-4 py-2.5 bg-white text-slate-600 rounded-xl hover:bg-slate-50 transition-all border border-slate-200 text-[9px] font-black uppercase"
              >
                <span className="flex items-center gap-2"><FileText size={14} /> Input Sikap Massal</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 border-dashed">
            <h3 className="text-slate-400 text-[10px] font-black tracking-[0.2em] mb-3 uppercase flex items-center gap-2">
              <Settings size={12} /> LOGO PESANTREN
            </h3>
            <div className="flex flex-col gap-2">
              <label className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-white text-blue-600 rounded-xl cursor-pointer hover:bg-blue-50 transition-all border border-blue-100 text-[10px] font-black">
                <Plus size={14} /> GANTI LOGO
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleLogoUpload}
                />
              </label>
              <button 
                onClick={() => {
                  if(confirm('Hapus logo kustom?')) {
                    setLogoUrl('');
                    localStorage.removeItem('al_hikmah_custom_logo');
                  }
                }}
                className="text-[9px] text-slate-400 hover:text-slate-600 transition-colors font-bold text-center underline underline-offset-2"
              >
                HAPUS LOGO
              </button>
            </div>
          </div>
        </div>

        <div className="pb-6 pt-4 border-t border-slate-100 flex flex-col gap-3">
            <button 
              onClick={() => setIsBulkGradesOpen(true)}
              disabled={filteredStudents.length === 0}
              className="w-full bg-slate-800 hover:bg-slate-900 text-white p-3 rounded-xl text-[10px] font-black flex items-center justify-center gap-2 transition-all shadow-lg shadow-slate-100"
            >
              <LayoutDashboard size={14} /> INPUT NILAI MASSAL
            </button>
          <button 
            onClick={handlePrint} 
            disabled={filteredStudents.length === 0}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl text-xs font-black flex items-center justify-center gap-3 transition-all shadow-xl shadow-blue-100 hover:translate-y-[-2px] active:translate-y-[0]"
          >
            <Printer size={18} /> CETAK RAPORT (PDF)
          </button>
          <button 
            onClick={handlePrintAll} 
            disabled={filteredStudents.length === 0}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 p-4 rounded-xl text-xs font-black flex items-center justify-center gap-3 transition-all border border-slate-200"
          >
            <Printer size={18} /> CETAK SEMUA KELAS (PDF)
          </button>
        </div>
      </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[140] md:hidden"
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto w-full print:overflow-visible print:h-auto">
        {/* MULTI STUDENT ADD MODAL */}
        {isBulkAddOpen && (
          <AnimatePresence>
            <div className="fixed inset-0 z-[200] overflow-y-auto no-print">
              <div className="flex min-h-full items-center justify-center p-4">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsBulkAddOpen(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" />
                <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="relative w-full max-w-2xl bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col">
                  <div className="p-8 pb-4 flex justify-between items-center border-b border-slate-100">
                    <div>
                      <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">INPUT DATA SANTRI SEKALIGUS</h2>
                      <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-wider">Masukkan daftar nama santri (Satu nama per baris)</p>
                    </div>
                    <button onClick={() => setIsBulkAddOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={24} /></button>
                  </div>
                  <div className="p-8">
                    <textarea 
                      className="w-full h-80 p-6 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all uppercase placeholder:normal-case"
                      placeholder="Contoh:&#10;Abdullah&#10;Abdurrahman&#10;Ahmad..."
                      value={bulkData}
                      onChange={e => setBulkData(e.target.value)}
                    />
                    <div className="mt-6 flex gap-4">
                      <button 
                        onClick={() => handleBulkAddStudents(bulkData)}
                        className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black tracking-widest shadow-xl shadow-blue-100 transition-all active:scale-95 uppercase flex items-center justify-center gap-2"
                      >
                        <Plus size={20} /> Tambahkan Santri
                      </button>
                      <button onClick={() => setIsBulkAddOpen(false)} className="px-8 py-4 bg-white text-slate-400 font-black rounded-2xl border border-slate-200 hover:bg-slate-50 transition-all uppercase">Batal</button>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </AnimatePresence>
        )}

        {/* BULK GRADES MODAL */}
        {isBulkGradesOpen && (
          <AnimatePresence>
            <div className="fixed inset-0 z-[200] overflow-y-auto no-print">
              <div className="flex min-h-full items-center justify-center p-4">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsBulkGradesOpen(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" />
                <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="relative w-full max-w-5xl bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="p-8 pb-4 border-b border-slate-100 flex flex-col gap-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase leading-none">INPUT NILAI MASSAL: KELAS {selectedClass}</h2>
                        <p className="text-[10px] font-black text-slate-400 mt-2 uppercase tracking-widest leading-none">PILIH MATA PELAJARAN UNTUK MULAI INPUT NILAI</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={handleSyncSubjects}
                          disabled={isSyncing}
                          className="px-4 py-2 bg-amber-50 text-amber-600 border border-amber-100 rounded-xl text-[10px] font-black uppercase hover:bg-amber-100 transition-all flex items-center gap-2"
                        >
                          {isSyncing ? 'Sinkronisasi...' : 'SINKRONKAN MAPEL'}
                        </button>
                        <button 
                          onClick={exportGradesToExcel}
                          className="px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-100 transition-all flex items-center gap-2"
                        >
                          EKSPOR EXCEL
                        </button>
                        <label className="px-4 py-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl text-[10px] font-black uppercase hover:bg-blue-100 transition-all flex items-center gap-2 cursor-pointer">
                          IMPOR EXCEL
                          <input type="file" accept=".xlsx, .xls" className="hidden" onChange={importGradesFromExcel} />
                        </label>
                        <button onClick={() => setIsBulkGradesOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-900"><X size={24} /></button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Pilih Mata Pelajaran</label>
                      <div className="relative group max-w-sm">
                        <select
                          value={selectedSubjectIndex}
                          onChange={(e) => setSelectedSubjectIndex(parseInt(e.target.value))}
                          className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-black text-slate-700 appearance-none outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all cursor-pointer uppercase tracking-widest"
                        >
                          {studentsList[0]?.subjects.map((sub, i) => (
                            <option key={i} value={i} className="font-sans uppercase">
                              {sub.name}
                            </option>
                          ))}
                        </select>
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                          <ChevronDown size={20} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 overflow-x-auto overflow-y-auto p-8 pt-4">
                    <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-2xl mb-6 flex items-center gap-3">
                      <div className="bg-blue-600 text-white p-2 rounded-xl"><LayoutDashboard size={18} /></div>
                      <div>
                        <p className="text-sm font-bold text-blue-800">Mode Grid Nilai</p>
                        <p className="text-[10px] font-bold text-blue-600/70 uppercase">Mata Pelajaran Aktif: {studentsList[0]?.subjects[selectedSubjectIndex]?.name}</p>
                      </div>
                    </div>
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-12 text-center">No</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[150px] sticky left-0 z-20 bg-slate-50 shadow-[2px_0_5_rgba(0,0,0,0.05)]">Nama Santri</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-40 text-center bg-blue-100/50">Nilai Tulis</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-40 text-center bg-emerald-100/50">Nilai Lisan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {studentsList.map((s, idx) => (
                          <tr key={s.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-6 py-4 text-xs font-bold text-slate-300 text-center">{idx + 1}</td>
                            <td className="px-6 py-4 sticky left-0 z-10 bg-white border-r border-slate-100 shadow-[2px_0_5_rgba(0,0,0,0.02)] group-hover:bg-slate-50">
                              <p className="text-sm font-black text-slate-700 uppercase truncate max-w-[140px]">{s.name}</p>
                              <p className="text-[10px] font-bold text-slate-400">NI: {s.nomorInduk || '-'}</p>
                            </td>
                            <td className="px-6 py-4 bg-blue-50/20 group-hover:bg-blue-50/40">
                              <input 
                                type="number" min="0" max="100"
                                className="w-full bg-white border border-blue-200 rounded-xl px-4 py-3 text-center text-sm font-black text-blue-600 focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all"
                                value={s.subjects[selectedSubjectIndex]?.tulis?.nilai || ''}
                                onChange={e => handleBulkUpdateGrades(s.id, selectedSubjectIndex, 'tulis', parseInt(e.target.value) || 0)}
                                onFocus={e => e.target.select()}
                              />
                            </td>
                            <td className="px-6 py-4 bg-emerald-50/20 group-hover:bg-emerald-50/40">
                              <input 
                                type="number" min="0" max="100"
                                className="w-full bg-white border border-emerald-200 rounded-xl px-4 py-3 text-center text-sm font-black text-emerald-600 focus:ring-4 focus:ring-emerald-100 focus:border-emerald-400 outline-none transition-all"
                                value={s.subjects[selectedSubjectIndex]?.lisan?.nilai || ''}
                                onChange={e => handleBulkUpdateGrades(s.id, selectedSubjectIndex, 'lisan', parseInt(e.target.value) || 0)}
                                onFocus={e => e.target.select()}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end">
                    <button onClick={() => setIsBulkGradesOpen(false)} className="px-12 py-4 bg-slate-900 hover:bg-black text-white rounded-2xl font-black tracking-widest transition-all">SELESAI</button>
                  </div>
                </motion.div>
              </div>
            </div>
          </AnimatePresence>
        )}

        {/* BULK IDENTITY MODAL */}
        {isBulkIdentityOpen && (
          <AnimatePresence>
            <div className="fixed inset-0 z-[200] overflow-y-auto no-print">
              <div className="flex min-h-full items-center justify-center p-4">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsBulkIdentityOpen(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" />
                <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="relative w-full max-w-7xl bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="p-8 pb-4 flex justify-between items-center border-b border-slate-100">
                    <div>
                      <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">INPUT IDENTITAS KELAS: {selectedClass}</h2>
                      <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-wider">Sunting data identitas santri dalam satu tabel atau via Excel</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={exportIdentityToExcel}
                        className="px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-100 transition-all flex items-center gap-2"
                      >
                        UNDUH TEMPLATE
                      </button>
                      <label className="px-4 py-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl text-[10px] font-black uppercase hover:bg-blue-100 transition-all flex items-center gap-2 cursor-pointer">
                        IMPOR EXCEL
                        <input type="file" accept=".xlsx, .xls" className="hidden" onChange={importIdentityFromExcel} />
                      </label>
                      <button onClick={() => setIsBulkIdentityOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={24} /></button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-x-auto overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-200">
                    <table className="w-full text-left border-collapse table-fixed min-w-[3000px]">
                      <thead>
                        <tr className="bg-slate-50 sticky top-0 z-10">
                          <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase w-12 text-center bg-slate-50 border-b">No</th>
                          <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase w-48 bg-slate-50 border-b sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">Nama Santri</th>
                          {[
                            { label: 'NIS/NISN', key: 'nomorInduk', isMain: true },
                            { label: 'NIS / NISN', key: 'nisNisn' },
                            { label: 'Tempat, Tanggal Lahir', key: 'tempatTanggalLahir' },
                            { label: 'Jenis Kelamin (L/P)', key: 'jenisKelamin' },
                            { label: 'Agama', key: 'agama' },
                            { label: 'Status dalam Keluarga', key: 'statusDalamKeluarga' },
                            { label: 'Anak ke-', key: 'anakKe' },
                            { label: 'Alamat Peserta Didik', key: 'alamatPesertaDidik' },
                            { label: 'Nomor Telepon Rumah', key: 'teleponRumah' },
                            { label: 'Sekolah Asal', key: 'sekolahAsal' },
                            { label: 'Di Pesantren Diterima di Kelas', key: 'diterimaDiKelas' },
                            { label: 'Diterima (Tanggal)', key: 'diterimaPadaTanggal' },
                            { label: 'Nama Ayah', key: 'namaAyah' },
                            { label: 'Nama Ibu', key: 'namaIbu' },
                            { label: 'Alamat Orang Tua', key: 'alamatOrangTua' },
                            { label: 'Nomor Telepon Orang Tua', key: 'teleponOrangTua' },
                            { label: 'Pekerjaan Ayah', key: 'pekerjaanAyah' },
                            { label: 'Pekerjaan Ibu', key: 'pekerjaanIbu' },
                            { label: 'Nama Wali', key: 'namaWali' },
                            { label: 'Alamat Wali', key: 'alamatWali' },
                            { label: 'Telepon Wali', key: 'teleponWali' },
                            { label: 'Pekerjaan Wali', key: 'pekerjaanWali' }
                          ].map(field => (
                            <th key={field.key} className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase w-48 bg-slate-50 border-b">{field.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {studentsList.map((s, idx) => (
                          <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-xs font-bold text-slate-300 text-center">{idx + 1}</td>
                            <td className="px-4 py-3 bg-white sticky left-0 z-10 border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                              <p className="text-xs font-black text-slate-700 truncate">{s.name}</p>
                            </td>
                            {[
                              { key: 'nomorInduk', isMain: true },
                              { key: 'nisNisn' },
                              { key: 'tempatTanggalLahir' },
                              { key: 'jenisKelamin' },
                              { key: 'agama' },
                              { key: 'statusDalamKeluarga' },
                              { key: 'anakKe' },
                              { key: 'alamatPesertaDidik' },
                              { key: 'teleponRumah' },
                              { key: 'sekolahAsal' },
                              { key: 'diterimaDiKelas' },
                              { key: 'diterimaPadaTanggal' },
                              { key: 'namaAyah' },
                              { key: 'namaIbu' },
                              { key: 'alamatOrangTua' },
                              { key: 'teleponOrangTua' },
                              { key: 'pekerjaanAyah' },
                              { key: 'pekerjaanIbu' },
                              { key: 'namaWali' },
                              { key: 'alamatWali' },
                              { key: 'teleponWali' },
                              { key: 'pekerjaanWali' }
                            ].map(field => (
                              <td key={field.key} className="px-2 py-1">
                                <input 
                                  className="w-full bg-transparent border-none px-2 py-1.5 text-xs font-bold text-slate-600 focus:bg-white focus:ring-2 focus:ring-blue-100 rounded-lg outline-none"
                                  value={field.isMain ? (s as any)[field.key] : (s.identity as any)?.[field.key] || ''}
                                  onChange={e => {
                                    if (field.isMain) {
                                      const newVal = e.target.value;
                                      const updated = { ...s, [field.key]: newVal };
                                      setStudentsList(prev => prev.map(stud => stud.id === s.id ? updated : stud));
                                      setDoc(doc(db, 'students', s.id), { [field.key]: newVal, updatedAt: new Date().toISOString() }, { merge: true })
                                        .catch(err => handleFirestoreError(err, OperationType.UPDATE, `students/${s.id}`));
                                    } else {
                                      handleBulkUpdateIdentity(s.id, field.key, e.target.value);
                                    }
                                  }}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end">
                    <button onClick={() => setIsBulkIdentityOpen(false)} className="px-12 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black tracking-widest transition-all">SIMPAN & SELESAI</button>
                  </div>
                </motion.div>
              </div>
            </div>
          </AnimatePresence>
        )}

        {/* BULK EXTRA MODAL */}
        {isBulkExtraOpen && (
          <AnimatePresence>
            <div className="fixed inset-0 z-[200] overflow-y-auto no-print">
              <div className="flex min-h-full items-center justify-center p-4">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsBulkExtraOpen(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" />
                <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="relative w-full max-w-5xl bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="p-8 pb-4 flex justify-between items-center border-b border-slate-100">
                    <div>
                      <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">INPUT EKSTRA KELAS: {selectedClass}</h2>
                      <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-wider">Sunting data ekstrakurikuler santri</p>
                    </div>
                    <button onClick={() => setIsBulkExtraOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={24} /></button>
                  </div>
                  <div className="flex-1 overflow-x-auto overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-200">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                      <thead>
                        <tr className="bg-slate-50 sticky top-0 z-10">
                          <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase w-12 text-center bg-slate-50 border-b">No</th>
                          <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase w-48 bg-slate-50 border-b sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">Nama Santri</th>
                          <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase bg-slate-50 border-b">Nama Kegiatan (Ekstra 1)</th>
                          <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase bg-slate-50 border-b">Keterangan (Ekstra 1)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {studentsList.map((s, idx) => (
                          <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-xs font-bold text-slate-300 text-center">{idx + 1}</td>
                            <td className="px-4 py-3 bg-white sticky left-0 z-10 border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                              <p className="text-xs font-black text-slate-700 uppercase truncate text-nowrap">{s.name}</p>
                            </td>
                            <td className="px-2 py-1">
                              <input 
                                className="w-full bg-transparent border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 focus:bg-white focus:ring-2 focus:ring-blue-100 rounded-lg outline-none uppercase"
                                placeholder="..."
                                value={s.extracurriculars?.[0]?.activity || ''}
                                onChange={e => handleBulkUpdateExtra(s.id, 0, 'activity', e.target.value.toUpperCase())}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input 
                                className="w-full bg-transparent border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 focus:bg-white focus:ring-2 focus:ring-blue-100 rounded-lg outline-none"
                                placeholder="..."
                                value={s.extracurriculars?.[0]?.note || ''}
                                onChange={e => handleBulkUpdateExtra(s.id, 0, 'note', e.target.value)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end">
                    <button onClick={() => setIsBulkExtraOpen(false)} className="px-12 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black tracking-widest transition-all uppercase">Selesai</button>
                  </div>
                </motion.div>
              </div>
            </div>
          </AnimatePresence>
        )}

        {/* BULK BEHAVIOR MODAL */}
        {isBulkBehaviorOpen && (
          <AnimatePresence>
            <div className="fixed inset-0 z-[200] overflow-y-auto no-print">
              <div className="flex min-h-full items-center justify-center p-4">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsBulkBehaviorOpen(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" />
                <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="relative w-full max-w-6xl bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="p-8 pb-4 flex justify-between items-center border-b border-slate-100">
                    <div>
                      <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">INPUT SIKAP KELAS: {selectedClass}</h2>
                      <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-wider">Sunting data deskripsi sikap santri</p>
                    </div>
                    <button onClick={() => setIsBulkBehaviorOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={24} /></button>
                  </div>
                  <div className="flex-1 overflow-x-auto overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-200">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                      <thead>
                        <tr className="bg-slate-50 sticky top-0 z-10">
                          <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase w-12 text-center bg-slate-50 border-b">No</th>
                          <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase w-48 bg-slate-50 border-b sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">Nama Santri</th>
                          <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase bg-slate-50 border-b">Deskripsi Sikap Spiritual</th>
                          <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase bg-slate-50 border-b">Deskripsi Sikap Sosial</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {studentsList.map((s, idx) => (
                          <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-xs font-bold text-slate-300 text-center">{idx + 1}</td>
                            <td className="px-4 py-3 bg-white sticky left-0 z-10 border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                              <p className="text-xs font-black text-slate-700 uppercase truncate text-nowrap">{s.name}</p>
                            </td>
                            <td className="px-2 py-1">
                              <textarea 
                                className="w-full bg-transparent border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 focus:bg-white focus:ring-2 focus:ring-blue-100 rounded-lg outline-none min-h-[60px] resize-none"
                                placeholder="..."
                                value={s.behavior.spiritual || ''}
                                onChange={e => handleBulkUpdateBehavior(s.id, 'spiritual', e.target.value)}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <textarea 
                                className="w-full bg-transparent border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 focus:bg-white focus:ring-2 focus:ring-blue-100 rounded-lg outline-none min-h-[60px] resize-none"
                                placeholder="..."
                                value={s.behavior.social || ''}
                                onChange={e => handleBulkUpdateBehavior(s.id, 'social', e.target.value)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end">
                    <button onClick={() => setIsBulkBehaviorOpen(false)} className="px-12 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black tracking-widest transition-all uppercase">Selesai</button>
                  </div>
                </motion.div>
              </div>
            </div>
          </AnimatePresence>
        )}

        {isModalOpen && editingStudent && (
          <AnimatePresence>
            <div className="fixed inset-0 z-[200] overflow-y-auto no-print">
              <div className="flex min-h-full items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                  animate={{ opacity: 1, backdropFilter: 'blur(4px)' }}
                  exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                  onClick={handleCloseModal}
                  className="fixed inset-0 bg-slate-900/40" 
                />
                
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="relative w-full max-w-4xl bg-white rounded-[32px] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
                >
                  <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
                    <div>
                      <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                        {editingStudent.id ? <Edit className="text-blue-600" size={20} /> : <Plus className="text-emerald-600" size={22} />}
                        {editingStudent.id ? 'SUNTING DATA SANTRI' : 'TAMBAH SANTRI BARU'}
                      </h2>
                      <div className="flex items-center gap-3 mt-1">
                        <p className="text-xs text-slate-400 font-medium">Lengkapi semua informasi yang diperlukan</p>
                        {editingStudent.id && (
                          <div className="flex items-center gap-1.5 ml-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              saveStatus === 'saving' ? 'bg-amber-400 animate-pulse' : 
                              saveStatus === 'saved' ? 'bg-emerald-500' : 
                              saveStatus === 'error' ? 'bg-rose-500' : 'bg-slate-300'
                            }`} />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              {saveStatus === 'saving' ? 'Menyimpan...' : 
                               saveStatus === 'saved' ? 'Tersimpan Otomatis' : 
                               saveStatus === 'error' ? 'Gagal Menyimpan' : 'Siap'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <button onClick={handleCloseModal} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-100 transition-all">
                      <X size={20} />
                    </button>
                  </div>

                    <div className="flex gap-1 bg-white p-1 rounded-2xl border border-slate-200 overflow-x-auto no-scrollbar whitespace-nowrap">
                      <button type="button" onClick={() => setActiveTab('basic')} className={`px-5 py-2 text-xs font-bold rounded-xl transition-all shrink-0 ${activeTab === 'basic' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>Informasi Dasar</button>
                      <button type="button" onClick={() => setActiveTab('grades')} className={`px-5 py-2 text-xs font-bold rounded-xl transition-all shrink-0 ${activeTab === 'grades' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>Nilai Akademik</button>
                      <button type="button" onClick={() => setActiveTab('extra')} className={`px-5 py-2 text-xs font-bold rounded-xl transition-all shrink-0 ${activeTab === 'extra' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>Ekstrakurikuler</button>
                      <button type="button" onClick={() => setActiveTab('identity')} className={`px-5 py-2 text-xs font-bold rounded-xl transition-all shrink-0 ${activeTab === 'identity' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>Identitas Santri</button>
                    </div>

                  <div className="flex-1 overflow-y-auto p-8">
                    <form id="student-form" onSubmit={handleSaveStudent} className="space-y-10">
                      {activeTab === 'basic' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
                          {/* Column 1: Identity */}
                          <div className="space-y-6">
                            <h3 className="text-[10px] uppercase font-black text-blue-600 tracking-[0.2em] mb-4 flex items-center gap-2">
                              <UserCircle size={14} /> IDENTITAS DASAR
                            </h3>
                              <div className="space-y-4">
                               <div className="form-group col-span-2">
                                 <label className="text-xs font-bold text-slate-500 mb-1.5 block">Foto Santri</label>
                                 <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                                   <div className="w-20 h-24 bg-white rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                                      {editingStudent.photoUrl ? (
                                        <img src={editingStudent.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                                      ) : (
                                        <UserCircle className="text-slate-200" size={40} />
                                      )}
                                   </div>
                                   <div className="flex-1">
                                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">Unggah Foto (3x4)</p>
                                      <div className="flex flex-wrap gap-2">
                                        <input 
                                          type="file" 
                                          accept="image/*"
                                          onChange={(e) => handlePhotoUpload(e, true)}
                                          className="text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[9px] file:font-black file:uppercase file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                                        />
                                        {editingStudent.photoUrl && (
                                          <button 
                                            type="button"
                                            onClick={() => setEditingStudent({ ...editingStudent, photoUrl: '' })}
                                            className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-[9px] font-black uppercase hover:bg-rose-100 transition-colors"
                                          >
                                            Hapus Foto
                                          </button>
                                        )}
                                      </div>
                                   </div>
                                 </div>
                               </div>
                               <div className="form-group col-span-2">
                                <label className="text-xs font-bold text-slate-500 mb-1.5 block">Nama Lengkap</label>
                                <input required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-medium text-slate-700" value={editingStudent.name} onChange={e => setEditingStudent({...editingStudent, name: e.target.value})} />
                              </div>
                              <div className="form-group col-span-2">
                                <label className="text-xs font-bold text-slate-500 mb-1.5 block">NIS/NISN</label>
                                <input required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-medium text-slate-700" value={editingStudent.nomorInduk} onChange={e => setEditingStudent({...editingStudent, nomorInduk: e.target.value})} />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-6">
                            <h3 className="text-[10px] uppercase font-black text-slate-600 tracking-[0.2em] mb-4 flex items-center gap-2">
                              <Settings size={14} /> INFORMASI KELAS
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="form-group">
                                <label className="text-xs font-bold text-slate-500 mb-1.5 block">Semester</label>
                                <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-medium text-slate-700" value={editingStudent.semester} onChange={e => setEditingStudent({...editingStudent, semester: e.target.value as any})}>
                                  <option value="GANJIL">GANJIL</option>
                                  <option value="GENAP">GENAP</option>
                                </select>
                              </div>
                              <div className="form-group">
                                <label className="text-xs font-bold text-slate-500 mb-1.5 block">Kelas</label>
                                <input readOnly className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-400 font-bold" value={editingStudent.class} />
                              </div>
                            </div>
                            <div className="form-group">
                              <label className="text-xs font-bold text-slate-500 mb-1.5 block">Tahun Pelajaran</label>
                              <input className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-medium text-slate-700" value={editingStudent.tahunPelajaran} onChange={e => setEditingStudent({...editingStudent, tahunPelajaran: e.target.value})} />
                            </div>
                          </div>
                        </div>
                      )}

                      {activeTab === 'grades' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 p-0.5">
                           <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl mb-6 flex items-start justify-between gap-3">
                             <div className="flex items-start gap-3">
                               <div className="bg-amber-100 p-2 rounded-xl text-amber-600"><FileText size={18} /></div>
                               <div>
                                 <p className="text-sm font-bold text-amber-800">Mode Input Nilai</p>
                                 <p className="text-xs text-amber-700/80 mt-0.5">Nilai yang Anda masukkan di sini akan langsung disimpan ke profil santri.</p>
                               </div>
                             </div>
                           </div>
                           <div className="flex items-center justify-between mb-4 px-1">
                              <h3 className="text-[10px] uppercase font-black text-blue-600 tracking-[0.2em] flex items-center gap-2">
                                 <FileText size={14} /> NILAI AKADEMIK
                              </h3>
                              <div className="flex items-center gap-2">
                                <select 
                                  className="text-[10px] font-black text-blue-600 uppercase bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-all outline-none border-none cursor-pointer"
                                  value=""
                                  onChange={e => {
                                    const selectedName = e.target.value;
                                    if (!selectedName) return;
                                    const sub = DEFAULT_AVAILABLE_SUBJECTS.find(s => s.name === selectedName);
                                    if (sub && editingStudent) {
                                      const exists = (editingStudent.subjects || []).some(s => s.name === sub.name);
                                      if (!exists) {
                                        const newSubs = [...(editingStudent.subjects || []), { ...sub, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } }];
                                        setEditingStudent({ ...editingStudent, subjects: newSubs });
                                      }
                                    }
                                  }}
                                >
                                  <option value="">+ TAMBAH MATA PELAJARAN</option>
                                  {DEFAULT_AVAILABLE_SUBJECTS.map(s => (
                                    <option key={s.name} value={s.name}>{s.name} ({s.category})</option>
                                  ))}
                                </select>
                                <button 
                                  type="button"
                                  onClick={() => {
                                    if (editingStudent) {
                                      setEditingStudent({
                                        ...editingStudent,
                                        subjects: DEFAULT_AVAILABLE_SUBJECTS.map(s => ({ ...s, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } }))
                                      });
                                    }
                                  }}
                                  className="text-[10px] font-black text-amber-600 uppercase bg-amber-50 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-all"
                                >
                                  RESET
                                </button>
                              </div>
                           </div>
                           <div className="grid grid-cols-1 gap-6">
                             {editingStudent.subjects?.map((sub, idx) => (
                               <div key={idx} className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 hover:border-blue-200 transition-all">
                                 <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-[10px] font-black text-slate-400 border border-slate-200">{idx + 1}</div>
                                 <div className="flex-1">
                                   <p className="text-xs font-black text-slate-400 tracking-wider">{sub.category}</p>
                                   <p className="text-sm font-bold text-slate-700">{sub.name}</p>
                                 </div>
                                 <div className="flex items-center gap-4">
                                   <div className="text-center">
                                     <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Tulis</label>
                                     <input 
                                       type="number" min="0" max="100"
                                       className="w-16 h-10 text-center bg-white border border-slate-200 rounded-xl font-bold text-blue-600 outline-none focus:ring-2 focus:ring-blue-100"
                                       value={sub.tulis.nilai}
                                       onChange={e => {
                                         const val = parseInt(e.target.value) || 0;
                                         const newSubs = [...(editingStudent.subjects || [])];
                                         newSubs[idx] = { ...newSubs[idx], tulis: { nilai: val, huruf: getHuruf(val) } };
                                         setEditingStudent({...editingStudent, subjects: newSubs});
                                       }}
                                     />
                                   </div>
                                   <div className="text-center">
                                     <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Lisan</label>
                                     <input 
                                       type="number" min="0" max="100"
                                       className="w-16 h-10 text-center bg-white border border-slate-200 rounded-xl font-bold text-emerald-600 outline-none focus:ring-2 focus:ring-emerald-100"
                                       value={sub.lisan.nilai}
                                       onChange={e => {
                                         const val = parseInt(e.target.value) || 0;
                                         const newSubs = [...(editingStudent.subjects || [])];
                                         newSubs[idx] = { ...newSubs[idx], lisan: { nilai: val, huruf: getHuruf(val) } };
                                         setEditingStudent({...editingStudent, subjects: newSubs});
                                       }}
                                     />
                                   </div>
                                 </div>
                               </div>
                             ))}
                           </div>
                        </div>
                      )}

                      {activeTab === 'extra' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                          <div className="flex items-center justify-between mb-6">
                            <h3 className="text-[10px] uppercase font-black text-blue-600 tracking-[0.2em] flex items-center gap-2">
                               <Plus size={14} /> KEGIATAN EKSTRAKURIKULER
                            </h3>
                            <button 
                              type="button"
                              onClick={() => {
                                const newExtras = [...(editingStudent.extracurriculars || [])];
                                newExtras.push({ activity: '', note: '' });
                                setEditingStudent({ ...editingStudent, extracurriculars: newExtras });
                              }}
                              className="text-[10px] font-black text-blue-600 uppercase bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1.5"
                            >
                              <Plus size={12} /> Tambah Kegiatan
                            </button>
                          </div>
                          <div className="space-y-4">
                            {(editingStudent.extracurriculars || []).length > 0 ? (
                              (editingStudent.extracurriculars || []).map((ex, idx) => (
                                <div key={idx} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 group">
                                  <div className="flex gap-4 items-start">
                                    <div className="flex-1 space-y-4">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="form-group">
                                          <label className="text-[10px] font-bold text-slate-500 mb-1 block uppercase tracking-wider">Nama Kegiatan</label>
                                          <input 
                                            placeholder="Contoh: Pramuka, Silat, dll"
                                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all font-medium text-slate-700" 
                                            value={ex.activity}
                                            onChange={e => {
                                              const newExtras = [...(editingStudent.extracurriculars || [])];
                                              newExtras[idx] = { ...newExtras[idx], activity: e.target.value };
                                              setEditingStudent({ ...editingStudent, extracurriculars: newExtras });
                                            }}
                                          />
                                        </div>
                                        <div className="form-group">
                                          <label className="text-[10px] font-bold text-slate-500 mb-1 block uppercase tracking-wider">Keterangan / Nilai</label>
                                          <input 
                                            placeholder="Contoh: Sangat Baik, Aktif, dll"
                                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all font-medium text-slate-700" 
                                            value={ex.note}
                                            onChange={e => {
                                              const newExtras = [...(editingStudent.extracurriculars || [])];
                                              newExtras[idx] = { ...newExtras[idx], note: e.target.value };
                                              setEditingStudent({ ...editingStudent, extracurriculars: newExtras });
                                            }}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                    <button 
                                      type="button"
                                      onClick={() => {
                                        const newExtras = (editingStudent.extracurriculars || []).filter((_, i) => i !== idx);
                                        setEditingStudent({ ...editingStudent, extracurriculars: newExtras });
                                      }}
                                      className="mt-6 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-3xl">
                                <p className="text-slate-400 font-bold text-sm">Belum ada data ekstrakurikuler</p>
                                <button 
                                  type="button"
                                  onClick={() => {
                                    const newExtras = [...(editingStudent.extracurriculars || [])];
                                    newExtras.push({ activity: '', note: '' });
                                    setEditingStudent({ ...editingStudent, extracurriculars: newExtras });
                                  }}
                                  className="mt-4 text-[10px] font-black text-blue-600 uppercase bg-blue-50 px-4 py-2 rounded-xl hover:bg-blue-100 transition-colors inline-flex items-center gap-2"
                                >
                                  <Plus size={14} /> Klik untuk Menambahkan
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {activeTab === 'identity' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                          <div className="flex items-center justify-between mb-6">
                            <h3 className="text-[10px] uppercase font-black text-blue-600 tracking-[0.2em] flex items-center gap-2">
                               <LucideUser size={14} /> KETERANGAN TENTANG DIRI PESERTA DIDIK
                            </h3>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
                            {[
                              { label: 'NIS / NISN', key: 'nisNisn' },
                              { label: 'Tempat, Tanggal Lahir', key: 'tempatTanggalLahir' },
                              { label: 'Jenis Kelamin (L/P)', key: 'jenisKelamin' },
                              { label: 'Agama', key: 'agama' },
                              { label: 'Status dalam Keluarga', key: 'statusDalamKeluarga' },
                              { label: 'Anak ke-', key: 'anakKe' },
                              { label: 'Alamat Peserta Didik', key: 'alamatPesertaDidik' },
                              { label: 'Nomor Telepon Rumah', key: 'teleponRumah' },
                              { label: 'Sekolah Asal', key: 'sekolahAsal' },
                              { label: 'Diterima di Pesantren ini (Kelas)', key: 'diterimaDiKelas' },
                              { label: 'Diterima (Tanggal)', key: 'diterimaPadaTanggal' },
                              { label: 'Nama Ayah', key: 'namaAyah' },
                              { label: 'Nama Ibu', key: 'namaIbu' },
                              { label: 'Alamat Orang Tua', key: 'alamatOrangTua' },
                              { label: 'Nomor Telepon Orang Tua', key: 'teleponOrangTua' },
                              { label: 'Pekerjaan Ayah', key: 'pekerjaanAyah' },
                              { label: 'Pekerjaan Ibu', key: 'pekerjaanIbu' },
                              { label: 'Nama Wali Santri', key: 'namaWali' },
                              { label: 'Alamat Wali Santri', key: 'alamatWali' },
                              { label: 'Nomor Telepon Wali', key: 'teleponWali' },
                              { label: 'Pekerjaan Wali Santri', key: 'pekerjaanWali' }
                            ].map(field => (
                              <div key={field.key} className="form-group">
                                <label className="text-[11px] font-bold text-slate-500 mb-1.5 block">{field.label}</label>
                                <input 
                                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-medium text-slate-700" 
                                  value={(editingStudent.identity as any)?.[field.key] || ''} 
                                  onChange={e => setEditingStudent({
                                    ...editingStudent, 
                                    identity: { 
                                      ...(editingStudent.identity || {} as any), 
                                      [field.key]: e.target.value 
                                    }
                                  })} 
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </form>
                  </div>

                  <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex gap-4 shrink-0">
                    <button 
                      form="student-form" 
                      type="submit" 
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-2xl font-black text-sm tracking-widest shadow-xl shadow-blue-200 flex items-center justify-center gap-3 transition-all"
                    >
                      {editingStudent.id ? 'SELESAI' : 'TAMBAH & LANJUT INPUT NILAI'}
                    </button>
                    <button onClick={handleCloseModal} className="px-8 bg-white text-slate-400 font-bold rounded-2xl border border-slate-200 hover:bg-slate-50 transition-colors">
                      BATAL
                    </button>
                  </div>

                </motion.div>
              </div>
            </div>
          </AnimatePresence>
        )}
        
        {studentsToPrint.length > 0 ? (
          <div className="flex flex-col items-center bg-white min-h-screen p-0 no-scrollbar print:m-0 print:p-0 print:block print:h-auto print:overflow-visible">
            {studentsToPrint.map(student => (
              <div key={student.id} className="print:m-0 print:p-0">
                <ReportTemplate 
                  student={student}
                  logoUrl={logoUrl}
                  globalNamaKelas={globalNamaKelas}
                  globalTanggalRaport={globalTanggalRaport}
                  globalWaliKelas={globalWaliKelas}
                  globalWaliKelasPutra={globalWaliKelasPutra}
                  globalWaliKelasPutri={globalWaliKelasPutri}
                  globalKepala={globalKepala}
                  studentRankings={studentRankings}
                  autoSaveStudent={autoSaveStudent}
                  setStudentsList={setStudentsList}
                />
              </div>
            ))}
          </div>
        ) : selectedStudent ? (
          <motion.div 
            key={selectedStudent.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 md:p-8 pb-20 flex flex-col items-center"
          >
             {/* Main Dashboard View (No-Print) */}
             {!showSheetPreview && (
                <StudentDashboard 
                  student={selectedStudent}
                  studentRankings={studentRankings}
                  onEdit={openEditModal}
                  onPrint={handlePrint}
                  onShowSheet={() => setShowSheetPreview(true)}
                />
             )}

             {/* Sheet Preview Toggle (when visible) */}
             {showSheetPreview && (
               <div className="w-full max-w-[210mm] mb-8 no-print flex justify-between items-center bg-white p-6 rounded-[32px] border border-blue-100 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shadow-inner"><Printer size={24} /></div>
                    <div>
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight leading-none mb-1">Preview Lembar Raport</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Formal A4 Sheet Layout</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowSheetPreview(false)}
                    className="px-6 py-3 bg-slate-900 hover:bg-black text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-slate-100"
                  >
                    KEMBALI KE DASHBOARD
                  </button>
               </div>
             )}

             <div className={`${showSheetPreview ? 'block' : 'hidden'} scale-[0.45] xs:scale-[0.55] sm:scale-[0.75] md:scale-100 print:scale-100 origin-top overflow-visible print:m-0 print:p-0 print:block print:h-auto`}>
               <ReportTemplate 
                  student={selectedStudent}
                  logoUrl={logoUrl}
                  globalNamaKelas={globalNamaKelas}
                  globalTanggalRaport={globalTanggalRaport}
                  globalWaliKelas={globalWaliKelas}
                  globalWaliKelasPutra={globalWaliKelasPutra}
                  globalWaliKelasPutri={globalWaliKelasPutri}
                  globalKepala={globalKepala}
                  studentRankings={studentRankings}
                  autoSaveStudent={autoSaveStudent}
                  setStudentsList={setStudentsList}
                />
             </div>
          </motion.div>
        ) : (
          <div className="h-screen flex flex-col items-center justify-center p-12 text-center bg-slate-50">
             <motion.div 
               initial={{ scale: 0.8, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               className="bg-white p-12 rounded-[40px] shadow-2xl shadow-blue-100 border border-blue-50"
             >
               <div className="w-24 h-24 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-8 text-blue-600">
                 <UserCircle size={64} className="opacity-40" />
               </div>
               <h2 className="text-3xl font-black text-slate-800 tracking-tight mb-3 uppercase">KELAS {selectedClass}</h2>
               <p className="text-slate-500 max-w-sm mx-auto leading-relaxed font-medium">Silahkan pilih data santri di sebelah kiri atau tambahkan santri baru untuk Kelas {selectedClass}.</p>
               <motion.button 
                 whileHover={{ scale: 1.05 }}
                 whileTap={{ scale: 0.95 }}
                 onClick={openAddModal} 
                 className="mt-10 bg-blue-600 text-white px-10 py-4 rounded-2xl font-black text-sm tracking-widest shadow-xl shadow-blue-200 w-full"
               >
                 TAMBAH SANTRI PERTAMA
               </motion.button>


             </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}
