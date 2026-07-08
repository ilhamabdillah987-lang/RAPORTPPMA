/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import XLSXStyle from 'xlsx-js-style';
import { Student, Subject, StudentIdentity } from './types';
import { ChevronUp, ChevronDown, Printer, UserCircle, Plus, Edit, Trash2, X, Save, LogOut, Lock, User as LucideUser, Search, Settings, LayoutDashboard, FileText, ChevronRight, ChevronLeft, Menu, LogIn, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, signOut, onAuthStateChanged, User as FirebaseUser, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, onSnapshot, waitForPendingWrites } from './firebase';

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
  
  const isQuotaError = errInfo.error.toLowerCase().includes('quota') || 
                       errInfo.error.toLowerCase().includes('limit exceeded') ||
                       errInfo.error.toLowerCase().includes('exhausted') ||
                       errInfo.error.toLowerCase().includes('billing');

  if (isQuotaError) {
    console.warn('Firestore Quota/Limit (Handled Gracefully): ', JSON.stringify(errInfo));
  } else {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }
  
  if (typeof window !== 'undefined') {
    const event = new CustomEvent('firestore-error', { detail: errInfo });
    window.dispatchEvent(event);
  }
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
  autoSaveStudent: (s: Partial<Student>, immediate?: boolean) => void | Promise<void>;
  setStudentsList: React.Dispatch<React.SetStateAction<Student[]>>;
  currentUserEmail?: string | null;
  selectedPrintSheets?: {
    cover: boolean;
    identitas: boolean;
    nilai: boolean;
    sikap: boolean;
    kehadiran: boolean;
    legger: boolean;
  };
}

const ReportTemplate = ({ 
  student, logoUrl, globalNamaKelas, globalTanggalRaport, 
  globalWaliKelas, globalWaliKelasPutra = '', globalWaliKelasPutri = '', globalKepala, studentRankings, 
  autoSaveStudent, setStudentsList, currentUserEmail = null, selectedPrintSheets
}: ReportTemplateProps) => {
  const waliKelasToPrint = useMemo(() => {
    if (globalWaliKelas) {
      return globalWaliKelas;
    }
    const jk = (student.identity?.jenisKelamin || '').trim().toUpperCase();
    const isPutra = jk.startsWith('L') || jk.startsWith('PUTRA');
    if (isPutra) {
      return globalWaliKelasPutra || '..........................';
    } else {
      return globalWaliKelasPutri || '..........................';
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
      {(!selectedPrintSheets || selectedPrintSheets.cover) && (
        <section className="page flex flex-col items-center justify-start pt-12 text-center">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="w-56 h-56 object-contain mb-8" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-56 h-56 border-3 border-dashed border-slate-200 rounded-3xl flex items-center justify-center mb-8 mx-auto">
              <span className="text-slate-300 font-extrabold text-xl uppercase tracking-widest px-4">LOGO PESANTREN</span>
            </div>
          )}
          <h1 className="text-4xl font-black uppercase mb-2 tracking-tighter text-slate-900">Laporan Hasil Belajar</h1>
          <h2 className="text-xl font-bold uppercase mb-8 text-slate-500 tracking-widest">Pondok Pesantren Modern Al-Hikmah</h2>
          
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

          <div className="mt-10 mb-6 space-y-4 break-inside-avoid">
            <p className="font-black uppercase text-2xl underline underline-offset-[12px] decoration-[3px] tracking-[0.3em] text-slate-900">SEMESTER {student.semester}</p>
            <div className="h-4"></div>
            <p className="font-extrabold uppercase text-xl tracking-[0.2em] text-slate-500">TAHUN PELAJARAN {student.tahunPelajaran}</p>
          </div>
        </section>
      )}

      {/* PAGE 2: IDENTITAS SANTRI */}
      {(!selectedPrintSheets || selectedPrintSheets.identitas) && (
        currentUserEmail ? (
          <section className="page flex flex-col pt-1 text-[12pt] font-sans font-bold gold-outline-page">
            <h1 className="text-center text-[12.5pt] font-black uppercase mb-4 tracking-wider text-slate-800">KETERANGAN TENTANG DIRI PESERTA DIDIK</h1>
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
                      <tr key={idx} className="align-top font-bold">
                        <td className="w-8 py-1 font-bold">{(row as any).id || ''}</td>
                        <td className={`w-[45%] py-1 ${row.indent ? 'pl-6' : ''} ${row.isHeader ? 'font-black' : 'font-bold'}`}>
                          {row.label}
                        </td>
                        <td className="w-4 py-1 text-center font-bold">:</td>
                        <td className="py-1 border-b border-dotted border-slate-300 min-h-[1.5em] font-black">
                          {row.value}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-end mt-4 px-12 font-bold">
              <div className="w-[3cm] h-[4cm] border-2 border-slate-900 flex items-center justify-center text-center text-[7pt] text-slate-400 font-bold bg-slate-50 uppercase tracking-tighter leading-tight shrink-0 overflow-hidden relative group">
                {student.photoUrl ? (
                  <img src={student.photoUrl} alt="Foto Santri" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span className="p-3">Pas Foto<br/>3 x 4 cm</span>
                )}
              </div>
              <div className="text-center w-80 mb-2 font-bold">
                <p className="mb-0 text-[12pt] font-bold">Tangerang, {globalTanggalRaport}</p>
                <p className="font-black uppercase text-[12pt]">Kepala Kepesantrenan,</p>
                <div className="h-20"></div>
                <p className="font-black text-[12pt] border-b-2 border-black inline-block min-w-[200px]">{globalKepala || ''}</p>
              </div>
            </div>
          </section>
        ) : (
          <section className="page flex flex-col items-center justify-center p-12 text-center print:hidden bg-slate-50 border border-dashed border-slate-200 my-8 mx-auto rounded-3xl min-h-[300px] w-full max-w-[180mm]">
            <div className="max-w-md mx-auto py-8">
              <span className="text-4xl block mb-4 leading-none">🔒</span>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 mb-1 leading-none">Halaman Identitas Dilindungi</h3>
              <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest leading-relaxed mt-2">
                Data diri Administratif & Identitas Orang Tua dilindungi kebijakan privasi Pesantren. Hanya pengisi data atau administrator yang login yang dapat melihat, mengubah, dan mencetak halaman ini.
              </p>
            </div>
          </section>
        )
      )}

      {/* PAGE 3: NILAI */}
      {(!selectedPrintSheets || selectedPrintSheets.nilai) && (
        <section className="page flex flex-col justify-between font-bold gold-outline-page">
          <div>
            <Header logoUrl={logoUrl} />
            <StudentInfo student={student} globalNamaKelas={globalNamaKelas} />
            <h3 className="font-black mb-3 uppercase text-lg border-b-2 border-black inline-block mt-4">A. NILAI TULIS & LISAN</h3>
            <table className="table-raport w-full text-center mt-2 font-bold">
              <thead>
                <tr className="font-bold">
                  <th rowSpan={2} className="w-[4%] font-bold">No</th>
                  <th rowSpan={2} className="w-[45%] font-bold text-left pl-4">Mata Pelajaran</th>
                  <th rowSpan={2} className="w-[7%] font-bold">KKM</th>
                  <th colSpan={2} className="w-[22%] font-bold">Nilai Tulis</th>
                  <th colSpan={2} className="w-[22%] font-bold">Nilai Lisan</th>
                </tr>
                <tr className="font-bold">
                  <th className="w-[11%] text-[8pt] italic font-bold">SKOR</th>
                  <th className="w-[11%] text-[8pt] italic font-bold">HURUF</th>
                  <th className="w-[11%] text-[8pt] italic font-bold">SKOR</th>
                  <th className="w-[11%] text-[8pt] italic font-bold">HURUF</th>
                </tr>
              </thead>
              <tbody>
                {(Object.entries(groupedSubjects) as [string, Subject[]][]).map(([category, subs], catIdx) => (
                  <React.Fragment key={category}>
                    <tr className="category-row">
                      <td colSpan={7} className="font-black uppercase py-2 bg-slate-50 border-y-2 border-black">
                        <span className="ml-2">{catIdx + 1}. {category}</span>
                      </td>
                    </tr>
                    {subs.map((sub, idx) => (
                      <tr key={idx} className="font-bold">
                        <td className="font-bold">{idx + 1}</td>
                        <td className="text-left font-black pl-4">{sub.name}</td>
                        <td className="font-bold">{sub.kkm}</td>
                        <td className="p-0 font-bold">
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
                            onBlur={() => autoSaveStudent(student, true)}
                          />
                          <span className="hidden print:inline font-bold">{sub.tulis?.nilai ?? '-'}</span>
                        </td>
                        <td className="font-black">{sub.tulis?.huruf ?? '-'}</td>
                        <td className="p-0 font-bold">
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
                            onBlur={() => autoSaveStudent(student, true)}
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
          </div>
          <div className="signature-section mt-5 text-[12pt] flex justify-between items-end px-4 page-break-inside-avoid">
            <div className="signature-box flex flex-col items-center flex-1 text-center leading-relaxed">
              <p className="font-medium">Mengetahui,</p>
              <p className="font-bold">Orang Tua/Wali Santri</p>
              <div className="h-16"></div>
              <p className="font-black border-b-2 border-black inline-block min-w-[200px] text-base h-8 whitespace-nowrap text-center">
                {student.identity?.namaAyah || student.identity?.namaWali || '..........................'}
              </p>
            </div>
            <div className="signature-box flex flex-col items-center flex-1 text-center leading-relaxed">
              <p className="font-medium text-right w-full pr-10 italic">Tangerang, {globalTanggalRaport}</p>
              <p className="font-bold">Wali Kelas,</p>
              <div className="h-16"></div>
              <p className="font-black border-b-2 border-black inline-block min-w-[200px] text-[11pt] h-8 whitespace-nowrap text-center">
                {waliKelasToPrint}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* PAGE 4: SIKAP */}
      {(!selectedPrintSheets || selectedPrintSheets.sikap) && (
        <section className="page flex flex-col justify-between font-bold gold-outline-page">
          <div>
            <Header logoUrl={logoUrl} />
            <StudentInfo student={student} globalNamaKelas={globalNamaKelas} />
            <h3 className="font-bold mb-3 uppercase text-lg border-b-2 border-black inline-block">B. SIKAP</h3>
            <table className="table-raport mb-6 text-[12pt] w-full">
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
                      onBlur={() => autoSaveStudent(student, true)}
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
                      onBlur={() => autoSaveStudent(student, true)}
                    />
                    <div className="hidden print:block whitespace-pre-wrap">{student.behavior.social || '-'}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="signature-section mt-auto text-[12pt] flex justify-between items-start px-4 page-break-inside-avoid pb-4">
            <div className="signature-box flex flex-col items-center flex-1 text-center leading-relaxed">
              <p className="font-medium">Mengetahui,</p>
              <p className="font-bold">Orang Tua/Wali Santri</p>
              <div className="h-16"></div>
              <p className="font-black border-b-2 border-black inline-block min-w-[200px] text-base h-8 whitespace-nowrap text-center">
                {student.identity?.namaAyah || student.identity?.namaWali || '..........................'}
              </p>
            </div>
            <div className="signature-box flex flex-col items-center flex-1 text-center leading-relaxed">
              <p className="font-medium text-right w-full pr-10 italic">Tangerang, {globalTanggalRaport}</p>
              <p className="font-bold">Wali Kelas,</p>
              <div className="h-16"></div>
              <p className="font-black border-b-2 border-black inline-block min-w-[200px] text-[11pt] h-8 whitespace-nowrap text-center">
                {waliKelasToPrint}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* PAGE 5: EKSTRA & ABSENSI */}
      {(!selectedPrintSheets || selectedPrintSheets.kehadiran) && (
        <section className="page flex flex-col justify-between font-bold gold-outline-page">
          <div>
            <Header logoUrl={logoUrl} />
            <StudentInfo student={student} globalNamaKelas={globalNamaKelas} />
            
            <h3 className="font-bold mb-3 uppercase text-lg border-b-2 border-black inline-block">C. EKSTRAKURIKULER</h3>
            <table className="table-raport mb-12 text-[12pt] w-full">
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
            <table className="table-raport mb-6 text-[12pt] w-[300px]">
              <thead>
                <tr className="bg-slate-50 h-10">
                  <th className="w-[60%]">KETERANGAN</th>
                  <th className="w-[40%]">JUMLAH (HARI)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="pl-4">Sakit</td>
                  <td className="p-0">
                    <input type="number" className="w-full text-center py-2 bg-transparent font-bold no-print focus:bg-blue-50/50 outline-none" value={student.attendance.sakit} onChange={e => { const updated = {...student, attendance: {...student.attendance, sakit: parseInt(e.target.value) || 0}}; setStudentsList(prev => prev.map(s => s.id === updated.id ? updated : s)); autoSaveStudent(updated); }} onBlur={() => autoSaveStudent(student, true)} />
                    <span className="hidden print:inline">{student.attendance.sakit}</span>
                  </td>
                </tr>
                <tr>
                  <td className="pl-4">Izin</td>
                  <td className="p-0">
                    <input type="number" className="w-full text-center py-2 bg-transparent font-bold no-print focus:bg-blue-50/50 outline-none" value={student.attendance.izin} onChange={e => { const updated = {...student, attendance: {...student.attendance, izin: parseInt(e.target.value) || 0}}; setStudentsList(prev => prev.map(s => s.id === updated.id ? updated : s)); autoSaveStudent(updated); }} onBlur={() => autoSaveStudent(student, true)} />
                    <span className="hidden print:inline">{student.attendance.izin}</span>
                  </td>
                </tr>
                <tr>
                  <td className="pl-4">Tanpa Keterangan</td>
                  <td className="p-0">
                    <input type="number" className="w-full text-center py-2 bg-transparent font-bold no-print focus:bg-blue-50/50 outline-none" value={student.attendance.alpha} onChange={e => { const updated = {...student, attendance: {...student.attendance, alpha: parseInt(e.target.value) || 0}}; setStudentsList(prev => prev.map(s => s.id === updated.id ? updated : s)); autoSaveStudent(updated); }} onBlur={() => autoSaveStudent(student, true)} />
                    <span className="hidden print:inline">{student.attendance.alpha}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
    
          <div className="signature-section mt-5 text-[12pt] flex justify-between items-end px-4 page-break-inside-avoid">
            <div className="signature-box flex flex-col items-center flex-1 text-center leading-relaxed">
              <p className="font-medium">Mengetahui,</p>
              <p className="font-bold">Orang Tua/Wali Santri</p>
              <div className="h-16"></div>
              <p className="font-black border-b-2 border-black inline-block min-w-[200px] text-base h-8 whitespace-nowrap">
                {student.identity?.namaAyah || student.identity?.namaWali || '..........................'}
              </p>
            </div>
            <div className="signature-box flex flex-col items-center flex-1 text-center leading-relaxed">
              <p className="font-medium text-right w-full pr-10 pr-0">Tangerang, {globalTanggalRaport}</p>
              <p className="font-bold">Wali Kelas,</p>
              <div className="h-16"></div>
              <p className="font-black border-b-2 border-black inline-block min-w-[200px] text-[11pt] h-8 whitespace-nowrap">
                {waliKelasToPrint}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* LEDGER */}
      {(!selectedPrintSheets || selectedPrintSheets.legger) && (
        <section className="page flex flex-col justify-start font-bold gold-outline-page">
          <Header logoUrl={logoUrl} />
          <div className="text-center mb-10 mt-6">
            <h1 className="text-2xl font-black uppercase tracking-widest text-slate-800">Ledger Perkembangan Nilai Santri</h1>
            <h2 className="text-lg font-bold uppercase text-slate-500 mt-1">Kelas {student.class} • TA {student.tahunPelajaran}</h2>
          </div>
          
          <table className="table-raport text-[12pt] w-full">
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
      )}
    </div>
  );
};

const StudentInfo = ({ student, globalNamaKelas }: { student: Student, globalNamaKelas?: string }) => (
  <div className="mb-2 font-bold select-none text-black">
    <table className="table-header w-full text-[9.5pt] font-bold">
      <tbody>
        <tr>
          <td className="w-[18%] font-bold">Nama Santri</td>
          <td className="w-[2%] font-bold">:</td>
          <td className="w-[40%] font-black uppercase">{student.name}</td>
          <td className="w-[15%] font-bold">Kelas</td>
          <td className="w-[2%] font-bold">:</td>
          <td className="w-[23%] font-black uppercase">{globalNamaKelas || student.class}</td>
        </tr>
        <tr>
          <td className="font-bold">NIS/NISN</td>
          <td className="font-bold">:</td>
          <td className="font-black">{student.nomorInduk}</td>
          <td className="font-bold">Semester</td>
          <td className="font-bold">:</td>
          <td className="relative font-bold">
            <span className="font-black">{student.semester}</span>
            {student.semester === "GANJIL" && (
              <div className="absolute -inset-x-2 -inset-y-1 border-2 border-green-700 pointer-events-none opacity-80 rounded-sm"></div>
            )}
          </td>
        </tr>
        <tr>
          <td className="font-bold">Nomor Urut Absen</td>
          <td className="font-bold">:</td>
          <td className="font-black">{student.noUrut}</td>
          <td className="font-bold">Tahun Pelajaran</td>
          <td className="font-bold">:</td>
          <td className="font-black">{student.tahunPelajaran}</td>
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

const safeLocalStorageSetItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`Gagal menyimpan ke localStorage untuk key "${key}":`, error);
  }
};

const compressImage = (file: File, maxWidth = 300, maxHeight = 400): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Clear canvas with transparent color to preserve PNG transparency
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const isPng = file.type === 'image/png' || 
                        file.type === 'image/x-png' || 
                        (file.name && file.name.toLowerCase().endsWith('.png'));
          if (isPng) {
            resolve(canvas.toDataURL('image/png'));
          } else {
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          }
        } else {
          resolve(event.target?.result as string || '');
        }
      };
      img.onerror = () => resolve('');
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
};

export default function App() {
  const configSaveTimeouts = useRef<{ [key: string]: any }>({});
  const pendingUpdatesRef = useRef<Record<string, { studentId: string; data: any; timer: any }>>({});

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const pendingCount = Object.keys(pendingUpdatesRef.current).length;
      if (pendingCount > 0) {
        // Trigger save synchronously or via fire-and-forget
        const list = Object.values(pendingUpdatesRef.current);
        list.forEach(({ studentId, data, timer }) => {
          clearTimeout(timer);
          delete pendingUpdatesRef.current[studentId];
          const cleaned = cleanUndefined(data);
          updateDoc(doc(db, 'students', studentId), { ...cleaned, updatedAt: new Date().toISOString() }).catch(() => {});
        });
        
        e.preventDefault();
        e.returnValue = 'Data Anda sedang disimpan ke cloud...';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
  const CLASSES = [
    '7 MTs Putra', '7 MTs Putri', '7 MTs Putra & Putri',
    '7 SMP Putra', '7 SMP Putri', '7 SMP Putra & Putri',
    '8 MTs Putra', '8 MTs Putri', '8 MTs Putra & Putri',
    '8 SMP Putra', '8 SMP Putri', '8 SMP Putra & Putri',
    '9 MTs Putra', '9 MTs Putri', '9 MTs Putra & Putri',
    '9 SMP Putra', '9 SMP Putri', '9 SMP Putra & Putri',
    '10 SMA Putra', '10 SMA Putri', '10 SMA Putra & Putri',
    '11 SMA Putra', '11 SMA Putri', '11 SMA Putra & Putri',
    '12 SMA Putra', '12 SMA Putri', '12 SMA Putra & Putri',
    'ALUMNI'
  ];

  const [selectedClass, setSelectedClass] = useState<string>(() => localStorage.getItem('selected_class') || '');
  const [selectedPrintSheets, setSelectedPrintSheets] = useState({
    cover: true,
    identitas: true,
    nilai: true,
    sikap: true,
    kehadiran: true,
    legger: false
  });
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState<string>(() => localStorage.getItem('al_hikmah_google_sheets_url') || '');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
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
  const [isMonitorModalOpen, setIsMonitorModalOpen] = useState(false);
  const [monitorStats, setMonitorStats] = useState<any>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [monitorSearchQuery, setMonitorSearchQuery] = useState('');
  
  // Admin Dashboard & Teacher States
  const [isAdminViewActive, setIsAdminViewActive] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>("guru");
  const [adminAuthInputEmail, setAdminAuthInputEmail] = useState('');
  const [adminClassesStats, setAdminClassesStats] = useState<any[]>([]);
  const [isAdminDataLoading, setIsAdminDataLoading] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'MTs' | 'SMP' | 'SMA'>('all');
  const [selectedAdminClassDetail, setSelectedAdminClassDetail] = useState<string | null>(null);
  const [adminSelectedClassStudents, setAdminSelectedClassStudents] = useState<any[]>([]);

  // Sub-navigation within Admin Dashboard
  const [adminSubTab, setAdminSubTab] = useState<'stats' | 'teachers'>('stats');

  // Teacher credentials states
  const [currentTeacher, setCurrentTeacher] = useState<{ username: string; waliKelas: string } | null>(() => {
    const cached = localStorage.getItem('raport_current_teacher');
    try {
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [isConfigsLoading, setIsConfigsLoading] = useState(false);

  const [teachersList, setTeachersList] = useState<any[]>([]);
  const [isTeachersLoading, setIsTeachersLoading] = useState(false);

  // Teacher CRUD Form States
  const [teacherFormName, setTeacherFormName] = useState('');
  const [teacherFormUsername, setTeacherFormUsername] = useState('');
  const [teacherFormPassword, setTeacherFormPassword] = useState('');
  const [teacherFormWaliKelas, setTeacherFormWaliKelas] = useState('');
  const [editingTeacherUsername, setEditingTeacherUsername] = useState<string | null>(null);

  // States for automatic teacher account registration
  const [autoSaveStatus, setAutoSaveStatus] = useState<'incomplete' | 'ready' | 'saving' | 'saved' | 'error'>('incomplete');
  const [autoSaveErrorMessage, setAutoSaveErrorMessage] = useState('');

  // Auto-save teacher registration
  useEffect(() => {
    const nameFilled = teacherFormName.trim().length >= 3;
    const classFilled = teacherFormWaliKelas.trim().length > 0;

    if (!nameFilled || !classFilled) {
      setAutoSaveStatus('incomplete');
      return;
    }

    // Checking if it was already marked as saved to avoid duplicate submissions
    if (autoSaveStatus === 'saved' || autoSaveStatus === 'saving') {
      return;
    }

    // Set status to ready
    setAutoSaveStatus('ready');

    const delay = 800; // 800ms debounce
    const timer = setTimeout(() => {
      handleAutoSaveTeacher();
    }, delay);

    return () => clearTimeout(timer);
  }, [teacherFormName, teacherFormWaliKelas, editingTeacherUsername]);

  // Front-end Login Inputs inside Modal
  const [teacherInputUsername, setTeacherInputUsername] = useState('');
  const [teacherInputPassword, setTeacherInputPassword] = useState('');
  const [activeAuthTab, setActiveAuthTab] = useState<'teacher' | 'admin'>('teacher');
  const [authError, setAuthError] = useState<string | null>(null);

  // Helper check for secure data modification / private viewer access
  const canEditOrViewPrivate = () => {
    return true;
  };

  // Sync Firebase authentication
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUserEmail(user.email);
        localStorage.setItem('raport_admin_email', user.email || '');
      } else {
        setCurrentUserEmail("guru");
        localStorage.removeItem('raport_admin_email');
      }
    });
    return () => unsubscribe();
  }, []);

  // Redirect admin back to monitoring view if no class is selected
  useEffect(() => {
    // Admin features inactive, direct entry only
  }, [selectedClass]);

  // Automatic central server database status sync on mount and class toggle
  useEffect(() => {
    fetchStatusSummary();
  }, [selectedClass]);

  const fetchAdminStats = async () => {
    setIsAdminDataLoading(true);
    try {
      const res = await fetch('/api/status-summary');
      if (res.ok) {
        const data = await res.json();
        setAdminClassesStats(data.classes || []);
      }
    } catch (err) {
      console.error("Gagal mengambil data monitoring admin:", err);
    } finally {
      setIsAdminDataLoading(false);
    }
  };

  const fetchTeachers = async () => {
    setIsTeachersLoading(true);
    try {
      const res = await fetch('/api/teachers');
      if (res.ok) {
        const data = await res.json();
        setTeachersList(data || []);
      }
    } catch (err) {
      console.error("Gagal mengambil data guru:", err);
    } finally {
      setIsTeachersLoading(false);
    }
  };

  useEffect(() => {
    if (isAdminViewActive) {
      fetchAdminStats();
      if (currentUserEmail) {
        fetchTeachers();
      }
    }
  }, [isAdminViewActive, currentUserEmail]);

  const handleViewAdminClassDetail = async (classNameStr: string) => {
    if (selectedAdminClassDetail === classNameStr) {
      setSelectedAdminClassDetail(null);
      setAdminSelectedClassStudents([]);
      return;
    }
    
    setSelectedAdminClassDetail(classNameStr);
    try {
      const res = await fetch(`/api/backup/${encodeURIComponent(classNameStr)}`);
      if (res.ok) {
        const data = await res.json();
        setAdminSelectedClassStudents(data.students || []);
      } else {
        setAdminSelectedClassStudents([]);
      }
    } catch (err) {
      console.error("Gagal mengambil data detil kelas:", err);
      setAdminSelectedClassStudents([]);
    }
  };

  const handleOpenAdminMenu = () => {
    setIsAdminViewActive(true);
  };

  const handleManualEmailLogin = () => {
    const trimmed = adminAuthInputEmail.trim().toLowerCase();
    if (trimmed) {
      setCurrentUserEmail(trimmed);
      localStorage.setItem('raport_admin_email', trimmed);
      setIsAuthModalOpen(false);
      setIsAdminViewActive(true);
    } else {
      showConfirm({
        title: 'Input Tidak Valid',
        message: 'Ketik email administrator yang valid.',
        cancelText: 'Tutup',
        confirmText: 'Selesai',
        onConfirm: () => {}
      });
    }
  };

  // Login handler for designated teacher accounts (single class choice selection, no credentials needed)
  const handleTeacherLogIn = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const selectedClassVal = teacherFormWaliKelas.trim();
    if (!selectedClassVal) {
      setAuthError("Harap pilih kelas terlebih dahulu");
      return;
    }

    const teacherInfo = {
      username: `Wali Kelas ${selectedClassVal}`,
      name: `Wali Kelas ${selectedClassVal}`,
      waliKelas: selectedClassVal
    };

    setCurrentTeacher(teacherInfo);
    localStorage.setItem('raport_current_teacher', JSON.stringify(teacherInfo));

    showConfirm({
      title: 'Masuk Berhasil',
      message: `Selamat datang di Workspace Kelas ${selectedClassVal}! Anda sekarang dapat mengisi dan mengelola dokumen raport kelas Anda.`,
      cancelText: 'Lanjut',
      confirmText: 'Selesai',
      onConfirm: () => {}
    });

    handleSelectClass(selectedClassVal);
  };

  const syncToPostgres = async () => {
    if (!selectedClass) return;

    setSyncStatus('syncing');
    try {
      // Pastikan data pending di-flush ke server lokal terlebih dahulu
      await flushPendingSaves();
      
      // Update cache lokal juga
      safeLocalStorageSetItem(`raport_students_cache_${selectedClass}`, JSON.stringify(studentsList));

      // Ambil data yang ada di localStorage
      const cachedStudentData = localStorage.getItem(`raport_students_cache_${selectedClass}`);
      
      const payload = {
        className: selectedClass,
        students: cachedStudentData ? JSON.parse(cachedStudentData) : studentsList,
      };

      console.log('Mengirim data ke Vercel Postgres via Prisma...', payload);

      const res = await fetch('/api/sync-prisma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const result = await res.json();
        setSyncStatus('success');
        showConfirm({
          title: 'Sinkronisasi Berhasil',
          message: `Berhasil menyinkronkan data ${result.count} santri Kelas ${selectedClass} ke database Vercel Postgres menggunakan Prisma!`,
          cancelText: 'Lanjut',
          confirmText: 'Sip',
          onConfirm: () => {}
        });
        setTimeout(() => setSyncStatus('idle'), 3000);
      } else {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `HTTP status ${res.status}`);
      }
    } catch (err: any) {
      console.warn('Prisma Postgres sync error:', err);
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 3000);
      showConfirm({
        title: 'Sinkronisasi Gagal',
        message: `Gagal menyinkronkan data ke PostgreSQL: ${err.message || err}`,
        cancelText: 'Tutup',
        confirmText: 'Coba Lagi',
        onConfirm: () => {
          syncToPostgres();
        }
      });
    }
  };

  const flushPendingSaves = async () => {
    const list = Object.values(pendingUpdatesRef.current);
    if (list.length === 0) return;
    
    console.log(`Flushing ${list.length} pending student updates...`);
    const promises = list.map(({ studentId, data, timer }) => {
      clearTimeout(timer);
      delete pendingUpdatesRef.current[studentId];
      const cleaned = cleanUndefined(data);
      return updateDoc(doc(db, 'students', studentId), { ...cleaned, updatedAt: new Date().toISOString() });
    });
    
    try {
      await Promise.all(promises);
      setSaveStatus('saved');
    } catch (err) {
      console.warn('Failed to flush some pending saves:', err);
    }
  };

  const handleLogout = () => {
    showConfirm({
      title: 'Konfirmasi Keluar',
      message: 'Apakah Anda yakin ingin keluar dari sistem Raport Al-Hikmah? Seluruh antrean penyimpanan data ke cloud akan dipastikan 100% aman sebelum pendaftaran sesi diakhiri.',
      cancelText: 'Batal',
      confirmText: 'Keluar Sekarang',
      onConfirm: async () => {
        // Immediately flush any configuration and student backups to the server before signing out!
        if (selectedClass && studentsList.length > 0) {
          try {
            await fetch('/api/backup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                className: selectedClass, 
                students: studentsList,
                waliKelas: globalWaliKelas || globalWaliKelasPutra || globalWaliKelasPutri 
              })
            });
          } catch (e) {
            console.warn('Backup on logout error:', e);
          }
        }

        // Also flush any pending debounced config saves!
        await flushPendingSaves();

        // Wait to make sure all Firestore/API pending writes are 100% received and settled
        try {
          await waitForPendingWrites(db);
        } catch (pwErr) {
          console.warn('Gagal menunda logout untuk pending writes:', pwErr);
        }

        try {
          await signOut(auth);
        } catch (e) {
          console.warn('Firebase signOut error:', e);
        }
        localStorage.removeItem('raport_admin_email');
        localStorage.removeItem('raport_current_teacher');
        setCurrentUserEmail("guru");
        setCurrentTeacher(null);
        setSelectedClass('');
        setIsAdminViewActive(false);
      }
    });
  };

  // Automated teacher registration
  const handleAutoSaveTeacher = async () => {
    const isEditing = editingTeacherUsername !== null;
    const trimmedName = teacherFormName.trim();
    const selectedWali = teacherFormWaliKelas.trim();

    if (!trimmedName || !selectedWali) {
      setAutoSaveStatus('incomplete');
      return;
    }

    // Dynamic generation of username & password to satisfy server constraints
    const derivedUsername = isEditing 
      ? editingTeacherUsername! 
      : (trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '') + Math.floor(100 + Math.random() * 900));
    const derivedPassword = "password123";

    setAutoSaveStatus('saving');
    setAutoSaveErrorMessage('');

    try {
      setAuthError(null);
      const url = isEditing ? `/api/teachers/${encodeURIComponent(editingTeacherUsername!)}` : '/api/teachers';
      const method = isEditing ? 'PUT' : 'POST';
      
      const body: any = {
        name: trimmedName,
        username: derivedUsername,
        waliKelas: selectedWali,
        password: derivedPassword
      };

      console.log(`[Admin Auto-Save] Saving teacher via ${method} to ${url}`, body);

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      let resData;
      try {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          resData = await res.json();
        } else {
          const text = await res.text();
          resData = { error: text || `HTTP Error ${res.status}` };
        }
      } catch (errParsing) {
        resData = { error: `Gagal memproses respon server (${res.status})` };
      }

      if (res.ok) {
        console.log("[Admin Auto-Save] Success:", resData);
        setAutoSaveStatus('saved');
        setAuthError(null);
        
        // Reset form variables after successful save so user can register the next teacher
        setTimeout(() => {
          setTeacherFormName('');
          setTeacherFormUsername('');
          setTeacherFormPassword('');
          setTeacherFormWaliKelas('');
          setEditingTeacherUsername(null);
          setAutoSaveStatus('incomplete');
        }, 1500);

        fetchTeachers();
        fetchAdminStats();
      } else {
        console.warn("[Admin Auto-Save] Fail:", resData);
        setAutoSaveStatus('error');
        setAutoSaveErrorMessage(resData.error || 'Gagal menyimpan data guru.');
      }
    } catch (err: any) {
      console.error("[Admin Auto-Save] Connection error:", err);
      setAutoSaveStatus('error');
      setAutoSaveErrorMessage(err.message || 'Koneksi gagal ke server.');
    }
  };

  // CRUD actions helper for registering teachers
  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleAutoSaveTeacher();
  };

  // Remove teacher
  const handleDeleteTeacher = async (usernameStr: string) => {
    showConfirm({
      title: 'Hapus Akun Guru',
      message: `Hapus akun guru '${usernameStr}' secara permanen dari server? Data wali kelas akan dinonaktifkan.`,
      isDanger: true,
      cancelText: 'Batal',
      confirmText: 'YA, HAPUS AKUN',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/teachers/${encodeURIComponent(usernameStr)}`, {
            method: 'DELETE'
          });
          if (res.ok) {
            fetchTeachers();
            fetchAdminStats();
          } else {
            const errData = await res.json();
            alert("Gagal menghapus guru: " + errData.error);
          }
        } catch (err) {
          console.error("Error menghapus guru:", err);
        }
      }
    });
  };
  
  // Custom Confirmation Modal State & Handler (Bypasses iframe alert/confirm limitations)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    confirmText: 'Ya, Lanjutkan',
    cancelText: 'Batal',
    isDanger: false
  });

  const showConfirm = (options: {
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
  }) => {
    setConfirmModal({
      isOpen: true,
      confirmText: 'Ya, Lanjutkan',
      cancelText: 'Batal',
      isDanger: false,
      ...options
    });
  };

  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false); // keep for single student grid if needed, or remove later
  const [studentsToPrint, setStudentsToPrint] = useState<Student[]>([]);
  const [bulkData, setBulkData] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dbError, setDbError] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Partial<Student> | null>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'grades' | 'identity' | 'extra'>('basic');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [selectedSubjectIndex, setSelectedSubjectIndex] = useState(0);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [showSheetPreview, setShowSheetPreview] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<'students' | 'bulk' | 'settings'>('students');

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEditingModal = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64String = await compressImage(file, 240, 320); // standard 3x4 portrait proportions
      if (!base64String) return;

      if (isEditingModal && editingStudent) {
        setEditingStudent({ ...editingStudent, photoUrl: base64String });
      } else if (selectedStudent) {
        const studentId = selectedStudent.id;
        setStudentsList(prev => prev.map(s => s.id === studentId ? { ...s, photoUrl: base64String } : s));
        await setDoc(doc(db, 'students', studentId), { photoUrl: base64String, updatedAt: new Date().toISOString() }, { merge: true });
      }
    } catch (err) {
      console.error("Gagal memproses unggahan foto:", err);
    }
  };

  // Close sidebar on mobile when student changes
  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
    // Also reset sheet preview when changing student
    setShowSheetPreview(false);
  }, [currentIndex]);

  useEffect(() => {
    const handleErr = (event: Event) => {
      const customEv = event as CustomEvent<FirestoreErrorInfo>;
      const errMsg = customEv.detail?.error || '';
      if (errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('limit exceeded')) {
        setDbError('Kuota harian database (Firebase) telah habis hari ini. Perubahan baru mungkin tidak tersimpan ke cloud, tetapi aplikasi tetap dapat digunakan secara lokal.');
      } else {
        setDbError(`Kesalahan database: ${errMsg}`);
      }
    };

    window.addEventListener('firestore-error', handleErr);
    return () => window.removeEventListener('firestore-error', handleErr);
  }, []);

  // Fetch configs from Firebase (ONE-TIME LOAD ON CLASS SELECT)
  useEffect(() => {
    // Reset all class-specific config states to prevent bleeding from the previous class
    setGlobalWaliKelas('');
    setGlobalWaliKelasPutra('');
    setGlobalWaliKelasPutri('');
    setGlobalNamaKelas('');
    setGlobalTanggalRaport('20 Desember 2025');
    setGlobalKepala('');
    setGlobalTanggalKenaikan('21 Juni 2026');

    if (!selectedClass) return;

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

    const getFallbackVal = (keyStr: string, cachedVal: string | null) => {
      if (cachedVal !== null) return cachedVal;
      if (keyStr === `tanggal_raport_${selectedClass}`) return '20 Desember 2025';
      if (keyStr === `tanggal_kenaikan_${selectedClass}`) return '21 Juni 2026';
      return '';
    };

    const loadConfigs = async () => {
      // Optimistic load of config values from local storage cache to minimize UI layout shifts/flickering
      try {
        for (const key of configKeys) {
          const cachedVal = localStorage.getItem(`raport_config_cache_${key}`);
          if (cachedVal !== null) {
            if (key === `wali_kelas_${selectedClass}`) setGlobalWaliKelas(cachedVal);
            else if (key === `wali_kelas_putra_${selectedClass}`) setGlobalWaliKelasPutra(cachedVal);
            else if (key === `wali_kelas_putri_${selectedClass}`) setGlobalWaliKelasPutri(cachedVal);
            else if (key === `nama_kelas_${selectedClass}`) setGlobalNamaKelas(cachedVal);
            else if (key === `tanggal_raport_${selectedClass}`) setGlobalTanggalRaport(cachedVal);
            else if (key === `kepala_kepasentrenan_${selectedClass}`) setGlobalKepala(cachedVal);
            else if (key === `tanggal_kenaikan_${selectedClass}`) setGlobalTanggalKenaikan(cachedVal);
            else if (key === 'al_hikmah_custom_logo') setLogoUrl(cachedVal);
          }
        }
      } catch (err) {
        console.warn('Gagal memuat awal konfigurasi optimistik:', err);
      }

      setIsConfigsLoading(true);
      for (const key of configKeys) {
        try {
          const snapshot = await getDoc(doc(db, 'configs', key));
          if (snapshot.exists()) {
            const val = snapshot.data().value || '';
            safeLocalStorageSetItem(`raport_config_cache_${key}`, val);
            if (key === `wali_kelas_${selectedClass}`) setGlobalWaliKelas(val);
            else if (key === `wali_kelas_putra_${selectedClass}`) setGlobalWaliKelasPutra(val);
            else if (key === `wali_kelas_putri_${selectedClass}`) setGlobalWaliKelasPutri(val);
            else if (key === `nama_kelas_${selectedClass}`) setGlobalNamaKelas(val);
            else if (key === `tanggal_raport_${selectedClass}`) setGlobalTanggalRaport(val);
            else if (key === `kepala_kepasentrenan_${selectedClass}`) setGlobalKepala(val);
            else if (key === `tanggal_kenaikan_${selectedClass}`) setGlobalTanggalKenaikan(val);
            else if (key === 'al_hikmah_custom_logo') setLogoUrl(val);
          } else {
            const cachedVal = localStorage.getItem(`raport_config_cache_${key}`);
            const fallback = getFallbackVal(key, cachedVal);
            if (key === `wali_kelas_${selectedClass}`) setGlobalWaliKelas(fallback);
            else if (key === `wali_kelas_putra_${selectedClass}`) setGlobalWaliKelasPutra(fallback);
            else if (key === `wali_kelas_putri_${selectedClass}`) setGlobalWaliKelasPutri(fallback);
            else if (key === `nama_kelas_${selectedClass}`) setGlobalNamaKelas(fallback);
            else if (key === `tanggal_raport_${selectedClass}`) setGlobalTanggalRaport(fallback);
            else if (key === `kepala_kepasentrenan_${selectedClass}`) setGlobalKepala(fallback);
            else if (key === `tanggal_kenaikan_${selectedClass}`) setGlobalTanggalKenaikan(fallback);
            else if (key === 'al_hikmah_custom_logo') setLogoUrl(fallback);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `configs/${key}`);
          const cachedVal = localStorage.getItem(`raport_config_cache_${key}`);
          const fallback = getFallbackVal(key, cachedVal);
          if (key === `wali_kelas_${selectedClass}`) setGlobalWaliKelas(fallback);
          else if (key === `wali_kelas_putra_${selectedClass}`) setGlobalWaliKelasPutra(fallback);
          else if (key === `wali_kelas_putri_${selectedClass}`) setGlobalWaliKelasPutri(fallback);
          else if (key === `nama_kelas_${selectedClass}`) setGlobalNamaKelas(fallback);
          else if (key === `tanggal_raport_${selectedClass}`) setGlobalTanggalRaport(fallback);
          else if (key === `kepala_kepasentrenan_${selectedClass}`) setGlobalKepala(fallback);
          else if (key === `tanggal_kenaikan_${selectedClass}`) setGlobalTanggalKenaikan(fallback);
          else if (key === 'al_hikmah_custom_logo') setLogoUrl(fallback);
        }
      }
      setIsConfigsLoading(false);
    };

    loadConfigs();
  }, [selectedClass]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await compressImage(file, 200, 200);
        if (base64) {
          setLogoUrl(base64);
          safeLocalStorageSetItem('al_hikmah_custom_logo', base64);
          await setDoc(doc(db, 'configs', 'al_hikmah_custom_logo'), { value: base64, updatedAt: new Date().toISOString() });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'configs/al_hikmah_custom_logo');
      }
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
    // Optimistic loading: pull cached student list first for instant rendering while network works
    try {
      const cached = localStorage.getItem(`raport_students_cache_${className}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`[Cache] Memuat secara optimistik ${parsed.length} santri Kelas ${className}`);
          setStudentsList(parsed);
        }
      }
    } catch (err) {
      console.warn("Gagal meload cache awal santri:", err);
    }

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
      safeLocalStorageSetItem(`raport_students_cache_${className}`, JSON.stringify(students));
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'students');
      
      // Secondary fallback: Try to pull the server-side backup (so we can see other people's inputs)
      try {
        console.log('Mencoba memulihkan data dari backup server untuk kelas:', className);
        const res = await fetch(`/api/backup/${encodeURIComponent(className)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.students && data.students.length > 0) {
            console.log('Berhasil membuat cadangan dari data server:', data.students.length);
            setStudentsList(data.students);
            safeLocalStorageSetItem(`raport_students_cache_${className}`, JSON.stringify(data.students));
            setIsLoading(false);
            return;
          }
        }
      } catch (backupError) {
        console.warn('Gagal memuat backup server otomatis:', backupError);
      }

      // Tertiary fallback: localStorage cache
      const cached = localStorage.getItem(`raport_students_cache_${className}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          console.log('Restored students due to Firestore limit:', parsed);
          setStudentsList(parsed);
        } catch (err) {
          console.error('Failed to parse cached students:', err);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const cleanUndefined = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) {
      return obj.map(cleanUndefined);
    }
    if (typeof obj === 'object') {
      const clean: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const val = obj[key];
          if (val !== undefined) {
            clean[key] = cleanUndefined(val);
          }
        }
      }
      return clean;
    }
    return obj;
  };

  const queueStudentUpdate = (studentId: string, dataPatch: any, immediate = false) => {
    setSaveStatus('saving');
    
    const existing = pendingUpdatesRef.current[studentId];
    if (existing) {
      clearTimeout(existing.timer);
    }
    
    const mergedData = existing ? { ...existing.data, ...dataPatch } : dataPatch;
    
    const performSave = async () => {
      delete pendingUpdatesRef.current[studentId];
      try {
        const cleaned = cleanUndefined(mergedData);
        await updateDoc(doc(db, 'students', studentId), { ...cleaned, updatedAt: new Date().toISOString() });
        if (Object.keys(pendingUpdatesRef.current).length === 0) {
          setSaveStatus('saved');
        }
      } catch (err) {
        console.warn('Auto save failed during queued write:', err);
        setSaveStatus('error');
      }
    };

    if (immediate) {
      performSave();
    } else {
      const timer = setTimeout(performSave, 400);
      pendingUpdatesRef.current[studentId] = {
        studentId,
        data: mergedData,
        timer
      };
    }
  };

  const autoSaveStudent = async (student: Partial<Student>, immediate = false) => {
    if (!student.id) return;
    const { id, ...dataPatch } = student;

    // --- STRATEGI SAVE LOCAL FIRST (SIMPAN PAKSA KE BROWSER SINKRON) ---
    if (selectedClass) {
      try {
        // 1. Update general cache raport_students_cache_${selectedClass}
        const cacheKey = `raport_students_cache_${selectedClass}`;
        const cached = localStorage.getItem(cacheKey);
        let list: Student[] = [];
        if (cached) {
          list = JSON.parse(cached);
        } else {
          list = [...studentsList];
        }
        const idx = list.findIndex(s => s.id === id);
        if (idx !== -1) {
          // Deep apply patch to cached student
          const target = { ...list[idx] };
          for (const key in dataPatch) {
            if (dataPatch[key] !== undefined) {
              if (typeof dataPatch[key] === 'object' && dataPatch[key] !== null && !Array.isArray(dataPatch[key])) {
                target[key] = { ...target[key], ...dataPatch[key] };
              } else {
                target[key] = dataPatch[key];
              }
            }
          }
          target.updatedAt = new Date().toISOString();
          list[idx] = target as Student;
          localStorage.setItem(cacheKey, JSON.stringify(list));
        }

        // 2. Simpan juga ke draft_raport global untuk redundansi ekstra sesuai request user
        const draftCached = localStorage.getItem('draft_raport');
        const draftData = draftCached ? JSON.parse(draftCached) : {};
        draftData[id] = {
          ...(draftData[id] || {}),
          ...dataPatch,
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem('draft_raport', JSON.stringify(draftData));
      } catch (err) {
        console.warn('Gagal melakukan Save-Local-First ke browser:', err);
      }
    }

    queueStudentUpdate(id, dataPatch, immediate);
  };

  const handleSelectClass = async (className: string) => {
    await flushPendingSaves();
    setSelectedClass(className);
    safeLocalStorageSetItem('selected_class', className);
    setCurrentIndex(0);
    setWorkspaceTab('students');
  };

  const handleUpdateGlobalWaliKelas = (val: string) => {
    setGlobalWaliKelas(val);
  };

  const handleUpdateGlobalWaliKelasPutra = (val: string) => {
    setGlobalWaliKelasPutra(val);
  };

  const handleUpdateGlobalWaliKelasPutri = (val: string) => {
    setGlobalWaliKelasPutri(val);
  };

  const handleUpdateGlobalNamaKelas = (val: string) => {
    setGlobalNamaKelas(val);
  };

  const handleUpdateGlobalTanggalRaport = (val: string) => {
    setGlobalTanggalRaport(val);
  };

  const handleUpdateGlobalKepala = (val: string) => {
    setGlobalKepala(val);
  };

  const handleUpdateGlobalTanggalKenaikan = (val: string) => {
    setGlobalTanggalKenaikan(val);
  };

  const [configSaveStatus, setConfigSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  const handleSaveAllConfigs = async () => {
    if (!selectedClass) return;
    setConfigSaveStatus('saving');
    try {
      const updates = [
        { key: `wali_kelas_${selectedClass}`, value: globalWaliKelas },
        { key: `wali_kelas_putra_${selectedClass}`, value: globalWaliKelasPutra },
        { key: `wali_kelas_putri_${selectedClass}`, value: globalWaliKelasPutri },
        { key: `nama_kelas_${selectedClass}`, value: globalNamaKelas },
        { key: `tanggal_raport_${selectedClass}`, value: globalTanggalRaport },
        { key: `kepala_kepasentrenan_${selectedClass}`, value: globalKepala },
        { key: `tanggal_kenaikan_${selectedClass}`, value: globalTanggalKenaikan }
      ];

      for (const update of updates) {
        await setDoc(doc(db, 'configs', update.key), { value: update.value, updatedAt: new Date().toISOString() });
        safeLocalStorageSetItem(`raport_config_cache_${update.key}`, update.value);
      }

      setConfigSaveStatus('success');
      setTimeout(() => setConfigSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Failed to save configs:', error);
      setConfigSaveStatus('error');
      setTimeout(() => setConfigSaveStatus('idle'), 5000);
      handleFirestoreError(error, OperationType.WRITE, `configs_batch_${selectedClass}`);
    }
  };

  // Automatic background saving for report settings (configs)
  useEffect(() => {
    if (!selectedClass || isConfigsLoading) return;

    const timer = setTimeout(() => {
      handleSaveAllConfigs();
    }, 1200); // Save after 1.2s of inactivity

    return () => clearTimeout(timer);
  }, [
    selectedClass,
    isConfigsLoading,
    globalWaliKelas,
    globalWaliKelasPutra,
    globalWaliKelasPutri,
    globalNamaKelas,
    globalTanggalRaport,
    globalKepala,
    globalTanggalKenaikan
  ]);

  // Browser beforeunload / unload listener for emergency save (Simpan Darurat) before exit/refresh
  useEffect(() => {
    const handleEmergencySave = () => {
      if (!selectedClass || studentsList.length === 0) return;

      const payload = {
        className: selectedClass,
        students: studentsList,
        waliKelas: globalWaliKelas || globalWaliKelasPutra || globalWaliKelasPutri
      };

      const bodyString = JSON.stringify(payload);
      let beaconSent = false;
      
      // Try navigator.sendBeacon first (ideal for unload events as they execute non-blockingly but guarantee delivery)
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        try {
          const blob = new Blob([bodyString], { type: 'application/json' });
          beaconSent = navigator.sendBeacon('/api/backup', blob);
        } catch (e) {
          console.warn('Emergency save beacon failed, falling back:', e);
        }
      }

      // Fallback to fetch with keepalive setting (modern standard for page out-of-process fetches)
      if (!beaconSent) {
        try {
          fetch('/api/backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: bodyString,
            keepalive: true
          }).catch(() => {});
        } catch (fErr) {
          console.warn('Keepalive emergency write failed:', fErr);
        }
      }

      // Also emergency save recent classroom settings configurations
      const updates = [
        { key: `wali_kelas_${selectedClass}`, value: globalWaliKelas },
        { key: `wali_kelas_putra_${selectedClass}`, value: globalWaliKelasPutra },
        { key: `wali_kelas_putri_${selectedClass}`, value: globalWaliKelasPutri },
        { key: `nama_kelas_${selectedClass}`, value: globalNamaKelas },
        { key: `tanggal_raport_${selectedClass}`, value: globalTanggalRaport },
        { key: `kepala_kepasentrenan_${selectedClass}`, value: globalKepala },
        { key: `tanggal_kenaikan_${selectedClass}`, value: globalTanggalKenaikan }
      ];

      for (const update of updates) {
        try {
          fetch(`/api/configs/${encodeURIComponent(update.key)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: update.value }),
            keepalive: true
          }).catch(() => {});
        } catch (err) {}
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      handleEmergencySave();
      try {
        localStorage.setItem('last_session_timestamp', new Date().toISOString());
      } catch (err) {}
    };

    const handleUnload = () => {
      handleEmergencySave();
      try {
        localStorage.setItem('last_session_timestamp', new Date().toISOString());
      } catch (err) {}
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
    };
  }, [
    selectedClass,
    studentsList,
    globalWaliKelas,
    globalWaliKelasPutra,
    globalWaliKelasPutri,
    globalNamaKelas,
    globalTanggalRaport,
    globalKepala,
    globalTanggalKenaikan
  ]);

  const handleProcessPromotion = async () => {
    if (!selectedClass || studentsList.length === 0) return;
    
    const isEvenSemester = studentsList[0]?.semester === 'GENAP';
    if (!isEvenSemester) {
      showConfirm({
        title: 'Peringatan',
        message: 'Proses kenaikan/kelulusan hanya bisa dilakukan di akhir SEMESTER GENAP.',
        cancelText: 'Tutup',
        confirmText: 'Selesai',
        onConfirm: () => {}
      });
      return;
    }

    showConfirm({
      title: 'Proses Kenaikan / Kelulusan',
      message: `Apakah Anda yakin ingin memproses kenaikan/kelulusan untuk seluruh santri di kelas ${selectedClass}? Data nilai akan direset dan tahun pelajaran akan diperbarui.`,
      isDanger: true,
      confirmText: 'YA, PROSES SEKARANG',
      onConfirm: async () => {
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
          showConfirm({
            title: 'Sukses',
            message: `Berhasil memproses kenaikan/kelulusan untuk kelas ${selectedClass}.`,
            cancelText: 'Tutup',
            confirmText: 'Selesai',
            onConfirm: () => {}
          });
          fetchStudents(selectedClass);
        } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, 'students');
        } finally {
          setIsLoading(false);
        }
      }
    });
  };

  // Auto-save effect: Updates UI in real-time, sinks to server with debounce
  useEffect(() => {
    if (!editingStudent || !editingStudent.id) return;

    // IF inside the editing modal (isModalOpen === true), DO NOT auto-save to server or update global list on every keystroke.
    // This stops the huge write bottlenecks/conflicts on server, keeps UI lightning-fast, and avoids random save failures.
    if (isModalOpen) {
      return;
    }

    // REAL-TIME UI UPDATE: Update local list immediately as user types (only used when editing cells directly on the main dashboard)
    setStudentsList(prev => prev.map(s => s.id === editingStudent.id ? { ...s, ...editingStudent } as Student : s));

    const timer = setTimeout(() => {
      autoSaveStudent(editingStudent);
    }, 500);

    return () => clearTimeout(timer);
  }, [editingStudent, isModalOpen]);

  // Synchronize student list to client-side localStorage cache and back up to local Express server
  useEffect(() => {
    if (selectedClass && !isLoading) {
      safeLocalStorageSetItem(`raport_students_cache_${selectedClass}`, JSON.stringify(studentsList));
      
      const timer = setTimeout(() => {
        fetch('/api/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            className: selectedClass, 
            students: studentsList,
            waliKelas: globalWaliKelas || globalWaliKelasPutra || globalWaliKelasPutri 
          })
        }).catch(err => console.warn('Pencatatan backup lokal tertunda:', err));
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [studentsList, selectedClass, isLoading, globalWaliKelas, globalWaliKelasPutra, globalWaliKelasPutri]);

  const pullBackupFromServer = async (classNameStr: string, quiet = false) => {
    if (!classNameStr) return;
    if (!quiet) setSyncStatus('syncing');
    try {
      const res = await fetch(`/api/backup/${encodeURIComponent(classNameStr)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.students && data.students.length > 0) {
          setStudentsList(data.students);
          safeLocalStorageSetItem(`raport_students_cache_${classNameStr}`, JSON.stringify(data.students));
          if (!quiet) {
            setSyncStatus('success');
            setTimeout(() => setSyncStatus('idle'), 3000);
          }
          return data.students;
        } else {
          throw new Error('Data backup masih kosong di server');
        }
      } else {
        throw new Error('Data backup tidak ditemukan di server');
      }
    } catch (err: any) {
      console.warn('Gagal sinkronisasi data server:', err);
      if (!quiet) {
        setSyncStatus('error');
        setTimeout(() => setSyncStatus('idle'), 3000);
      }
    }
  };

  const fetchStatusSummary = async () => {
    setIsStatsLoading(true);
    try {
      const res = await fetch('/api/status-summary');
      if (res.ok) {
        const data = await res.json();
        setMonitorStats(data);
      } else {
        throw new Error('STATUS API NOT OK');
      }
    } catch (err) {
      console.warn('Gagal memuat status server, beralih ke cache lokal:', err);
      // Fallback: Generate statistics from localStorage
      const predefinedClasses = ['7 MTs', '7 SMP', '8 MTs', '8 SMP', '9 MTs', '9 SMP', '10 SMA', '11 SMA', '12 SMA', 'ALUMNI'];
      let filled = 0;
      let total = 0;
      const classesData = predefinedClasses.map(cls => {
        const cached = localStorage.getItem(`raport_students_cache_${cls}`);
        const students = cached ? JSON.parse(cached) : [];
        const hasData = students.length > 0;
        if (hasData) {
          filled++;
          total += students.length;
        }
        return {
          name: cls,
          hasData,
          studentCount: students.length,
          waliKelas: "-",
          updatedAt: null
        };
      });
      setMonitorStats({
        classes: classesData,
        totalClasses: predefinedClasses.length,
        filledClasses: filled,
        totalStudents: total,
        serverTime: new Date().toISOString(),
        isLocalFallback: true
      });
    } finally {
      setIsStatsLoading(false);
    }
  };

  const handleCloseModal = () => {
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
      // Optimistically update React state immediately
      setStudentsList(prev => [...prev, ...newStudents]);
      
      // Perform bulk backup saving in a single request instead of multiple sequential writes!
      if (selectedClass) {
        const fullList = [...studentsList, ...newStudents];
        await fetch('/api/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            className: selectedClass, 
            students: fullList,
            waliKelas: globalWaliKelas || globalWaliKelasPutra || globalWaliKelasPutri 
          })
        });
      }

      // Also save individual records asynchronously
      for (const s of newStudents) {
        setDoc(doc(db, 'students', s.id), { ...s, updatedAt: new Date().toISOString() }).catch(err => {
          console.warn(`Gagal menulis individual student detail untuk ${s.name}:`, err);
        });
      }

      setBulkData(''); // Clear the text input
      setIsBulkAddOpen(false);
      
      showConfirm({
        title: 'Berhasil',
        message: `Berhasil menambahkan ${newStudents.length} santri baru ke Kelas ${selectedClass}!`,
        cancelText: 'Tutup',
        onConfirm: () => {}
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'students');
    }
  };

  const handleBulkUpdateGrades = async (studentId: string, subIdx: number, type: 'tulis' | 'lisan', value: number, immediate = false) => {
    const student = studentsList.find(s => s.id === studentId);
    if (student) {
      const newSubs = [...student.subjects];
      newSubs[subIdx] = {
        ...newSubs[subIdx],
        [type]: { nilai: value, huruf: getHuruf(value) }
      };
      
      const updated = { ...student, subjects: newSubs };
      setStudentsList(prev => prev.map(s => s.id === studentId ? updated : s));
      queueStudentUpdate(studentId, { subjects: newSubs }, immediate);
    }
  };

  const handleBulkUpdateExtra = async (studentId: string, activityIdx: number, key: 'activity' | 'note', value: string, immediate = false) => {
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
      queueStudentUpdate(studentId, { extracurriculars: newExtras }, immediate);
    }
  };

  const handleBulkUpdateBehavior = async (studentId: string, type: 'spiritual' | 'social', value: string, immediate = false) => {
    const student = studentsList.find(s => s.id === studentId);
    if (student) {
      const newBehavior = {
        ...student.behavior,
        [type]: value
      };
      
      const updated = { ...student, behavior: newBehavior };
      setStudentsList(prev => prev.map(s => s.id === studentId ? updated : s));
      queueStudentUpdate(studentId, { behavior: newBehavior }, immediate);
    }
  };

  const handleBulkUpdateIdentity = async (studentId: string, key: string, value: string, immediate = false) => {
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
      queueStudentUpdate(studentId, { identity: newIdentity }, immediate);
    }
  };

  const handleClearClass = async () => {
    await flushPendingSaves();
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

  const monitorSearchResults = useMemo(() => {
    if (!monitorSearchQuery || monitorSearchQuery.length < 2) return [];
    
    const predefinedClasses = ['7 MTs', '7 SMP', '8 MTs', '8 SMP', '9 MTs', '9 SMP', '10 SMA', '11 SMA', '12 SMA', 'ALUMNI'];
    const results: any[] = [];
    
    predefinedClasses.forEach(cls => {
      const cached = localStorage.getItem(`raport_students_cache_${cls}`);
      if (cached) {
        try {
          const students = JSON.parse(cached) as Student[];
          students.forEach(st => {
            if (
              String(st.name || '').toLowerCase().includes(monitorSearchQuery.toLowerCase()) ||
              String(st.nomorInduk || '').includes(monitorSearchQuery)
            ) {
              results.push({
                ...st,
                className: cls
              });
            }
          });
        } catch (e) {
          console.error(e);
        }
      }
    });
    
    return results;
  }, [monitorSearchQuery]);

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
    } as Student;

    setSaveStatus('saving');
    setSaveErrorMessage(null);

    try {
      // Optimistically update local UI state immediately
      setStudentsList(prev => {
        const nextList = [...prev];
        const existIdx = nextList.findIndex(s => s.id === studentId);
        if (existIdx !== -1) {
          nextList[existIdx] = payload;
        } else {
          nextList.push(payload);
        }
        // Save to local cache right away to avoid any lag or race conditions
        safeLocalStorageSetItem(`raport_students_cache_${selectedClass}`, JSON.stringify(nextList));
        return nextList;
      });

      const cleanedPayload = cleanUndefined(payload);
      await setDoc(doc(db, 'students', studentId), cleanedPayload, { merge: true });
      
      setSaveStatus('saved');

      if (!isEdit) {
        setSearchTerm('');
        setCurrentIndex(studentsList.length);
      }
      
      if (!stayOpen) {
        setIsModalOpen(false);
        setEditingStudent(null);
        setSaveStatus('idle');
      }
    } catch (e) {
      console.error('Save failed:', e);
      setSaveStatus('error');
      setSaveErrorMessage(e instanceof Error ? e.message : String(e));
      handleFirestoreError(e, OperationType.WRITE, `students/${studentId}`);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    if (!id) return;
    showConfirm({
      title: 'Hapus Data Santri',
      message: 'Apakah Anda yakin ingin menghapus data santri ini? Seluruh data nilai, sikap dan presensi akan dihapus permanen dari server dan local storage.',
      isDanger: true,
      confirmText: 'YA, HAPUS DATA',
      onConfirm: async () => {
        // 1. Optimistic Local State Update
        setStudentsList(prev => {
          const updated = prev.filter(s => s.id !== id);
          
          // 2. Persist to client-side localStorage cache immediately
          if (selectedClass) {
            safeLocalStorageSetItem(`raport_students_cache_${selectedClass}`, JSON.stringify(updated));
            
            // 3. Back up to local Express server
            fetch('/api/backup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                className: selectedClass, 
                students: updated,
                waliKelas: globalWaliKelas || globalWaliKelasPutra || globalWaliKelasPutri 
              })
            }).catch(err => console.warn('Pencatatan backup lokal tertunda:', err));
          }
          return updated;
        });

        // Adjust index gracefully
        if (currentIndex > 0) {
          setCurrentIndex(prev => Math.min(prev - 1, Math.max(0, studentsList.length - 2)));
        } else {
          setCurrentIndex(0);
        }

        // 4. Try to delete from cloud database (handled gracefully if quota is exceeded)
        try {
          await deleteDoc(doc(db, 'students', id));
        } catch (e) {
          handleFirestoreError(e, OperationType.DELETE, `students/${id}`);
        }
      }
    });
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
    
    // Construct values array for aoa_to_sheet
    // Row 1 (Header level 1): NO, NAMA SANTRI, NIS/NISN, and Subject names (merged over 2 columns each)
    const row1: any[] = ['NO', 'NAMA SANTRI', 'NIS/NISN'];
    const row2: any[] = ['', '', '']; // Vertical merges

    subjects.forEach(sub => {
      row1.push(sub.toUpperCase());
      row1.push(''); // For the horizontal merge
      row2.push('TULIS');
      row2.push('LISAN');
    });

    const aoa: any[][] = [row1, row2];

    // Populate data rows
    studentsList.forEach((s, index) => {
      const row: any[] = [
        index + 1, // NO
        s.name, // NAMA SANTRI
        s.nomorInduk || '' // NIS/NISN
      ];

      s.subjects.forEach(sub => {
        row.push(sub.tulis?.nilai ?? 0);
        row.push(sub.lisan?.nilai ?? 0);
      });

      aoa.push(row);
    });

    // Create Sheet using sheetJS utils
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Apply Merges
    const merges = [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, // NO
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, // NAMA SANTRI
      { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } }  // NIS/NISN
    ];

    for (let i = 0; i < subjects.length; i++) {
      merges.push({
        s: { r: 0, c: 3 + 2 * i },
        e: { r: 0, c: 3 + 2 * i + 1 }
      });
    }
    ws['!merges'] = merges;

    // Apply Styling using XLSXStyle
    const headerStyle = {
      fill: { fgColor: { rgb: "C4D79B" } }, // Light Green background exactly like Excel screenshot
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "000000" } }, // Black text, bold
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } }
      }
    };

    const bodyStyle = {
      fill: { fgColor: { rgb: "FFFF00" } }, // Solid yellow background matching bodyStyle elsewhere & image
      font: { name: "Arial", sz: 10, color: { rgb: "000000" } },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } }
      }
    };

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) {
          ws[cellAddress] = { t: 's', v: '' }; // Prevent missing cell errors
        }

        if (R < 2) {
          // Headers styling
          ws[cellAddress].s = headerStyle;
        } else {
          // Data rows styling
          const cellStyle = { ...bodyStyle } as any;
          if (C === 1) {
            cellStyle.alignment = { horizontal: "left", vertical: "center" };
          } else {
            cellStyle.alignment = { horizontal: "center", vertical: "center" };
          }
          ws[cellAddress].s = cellStyle;
        }
      }
    }

    // Dynamic width layout helper
    ws['!cols'] = [
      { wch: 6 },  // NO
      { wch: 35 }, // NAMA SANTRI
      { wch: 16 }  // NIS/NISN
    ];
    for (let i = 0; i < subjects.length; i++) {
      ws['!cols'].push({ wch: 12 }); // TULIS
      ws['!cols'].push({ wch: 12 }); // LISAN
    }

    // Dynamic height layouts
    const rowHeights = [{ hpt: 24 }, { hpt: 20 }];
    for (let r = 2; r <= range.e.r; r++) {
      rowHeights.push({ hpt: 19 });
    }
    ws['!rows'] = rowHeights;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "NILAI");
    XLSXStyle.writeFile(wb, `NILAI_KELAS_${selectedClass.replace(' ', '_')}.xlsx`);
  };

  const importGradesFromExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onerror = (err) => {
      showConfirm({
        title: 'Gagal Membaca File',
        message: 'Tidak dapat membaca file Excel tersebut. Pastikan file tidak rusak.',
        cancelText: 'Tutup',
        onConfirm: () => {}
      });
    };

    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
          throw new Error('Lembar kerja pertama Excel kosong atau tidak ditemukan.');
        }

        // Parse as nested arrays to check header layout row-by-row
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        if (rows.length === 0) {
          throw new Error('Tidak ada baris data terdeteksi di dalam file Excel.');
        }

        // Identify format: check if it's the dual rows (with 'TULIS' in Row 2)
        const isNewFormat = rows.length > 1 && 
                            rows[1] && 
                            (String(rows[1][3] || '').toUpperCase() === 'TULIS' || 
                             String(rows[1][4] || '').toUpperCase() === 'LISAN');

        const updatedStudents = [...studentsList];
        let matchCount = 0;

        if (isNewFormat) {
          // Dual header parsing
          const subjectColMap: Record<string, { tulisCol: number, lisanCol: number }> = {};
          
          // Row 0 has subject names starting at column index 3 (D), then index 5, 7, etc.
          // Due to cell merges, we scan each cell in the header row for a populated subject name
          const headerRow0 = rows[0];
          for (let colIdx = 3; colIdx < headerRow0.length; colIdx++) {
            const val = String(headerRow0[colIdx] || '').trim();
            if (val && val !== 'NO' && val !== 'NAMA SANTRI' && val !== 'NIS/NISN') {
              // The next cell is usually the Lisan, or we can check Row 1 (headerRow1)
              subjectColMap[val.toUpperCase()] = {
                tulisCol: colIdx,
                lisanCol: colIdx + 1
              };
            }
          }

          // Row 2 up to rows.length are student rows
          for (let rIdx = 2; rIdx < rows.length; rIdx++) {
            const row = rows[rIdx];
            if (!row || row.length < 2) continue;

            const nameInExcel = row[1] ? String(row[1]).trim() : '';
            if (!nameInExcel) continue;

            const excelNis = row[2] ? String(row[2]).trim() : '';
            const studentIdx = updatedStudents.findIndex(s => {
              const matchByName = String(s.name || '').trim().toUpperCase() === nameInExcel.toUpperCase();
              const matchByNis = excelNis !== '' && s.nomorInduk && String(s.nomorInduk).trim() === excelNis;
              return matchByNis || matchByName;
            });

            if (studentIdx !== -1) {
              matchCount++;
              const student = updatedStudents[studentIdx];
              const newSubs = student.subjects.map(sub => {
                const colInfo = subjectColMap[sub.name.toUpperCase()];
                if (colInfo) {
                  const tulisVal = row[colInfo.tulisCol];
                  const lisanVal = row[colInfo.lisanCol];
                  return {
                    ...sub,
                    tulis: typeof tulisVal !== 'undefined' && tulisVal !== '' ? { nilai: parseInt(tulisVal) || 0, huruf: getHuruf(parseInt(tulisVal) || 0) } : sub.tulis,
                    lisan: typeof lisanVal !== 'undefined' && lisanVal !== '' ? { nilai: parseInt(lisanVal) || 0, huruf: getHuruf(parseInt(lisanVal) || 0) } : sub.lisan,
                  };
                }
                return sub;
              });

              // Apply custom data syncing to localStorage immediately (Local-Save-First layout)
              updatedStudents[studentIdx] = { ...student, subjects: newSubs, updatedAt: new Date().toISOString() };
            }
          }
        } else {
          // Standard JSON array fallback for older sheets
          const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
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
              matchCount++;
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

              updatedStudents[studentIdx] = { ...student, subjects: newSubs, updatedAt: new Date().toISOString() };
            }
          }
        }

        setStudentsList(updatedStudents);

        // Update local storage caches immediately
        if (selectedClass) {
          safeLocalStorageSetItem(`raport_students_cache_${selectedClass}`, JSON.stringify(updatedStudents));
          
          // Simpan juga ke draft_raport global untuk redundansi ekstra sesuai request user
          try {
            const draftCached = localStorage.getItem('draft_raport');
            const draftData = draftCached ? JSON.parse(draftCached) : {};
            updatedStudents.forEach(st => {
              // Extract data patch
              const dataPatch: any = { subjects: st.subjects };
              draftData[st.id] = {
                ...(draftData[st.id] || {}),
                ...dataPatch,
                updatedAt: new Date().toISOString()
              };
            });
            localStorage.setItem('draft_raport', JSON.stringify(draftData));
          } catch(e) {}
        }

        // Bulk server backup
        if (selectedClass && updatedStudents.length > 0) {
          await fetch('/api/backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              className: selectedClass, 
              students: updatedStudents,
              waliKelas: globalWaliKelas || globalWaliKelasPutra || globalWaliKelasPutri 
            })
          }).catch(err => {
            console.warn('Backup payload to server failed:', err);
          });
        }

        showConfirm({
          title: 'Sukses Impor',
          message: `Berhasil mencocokkan & mengimpor nilai untuk ${matchCount} dari ${rows.length - 2} baris data santri!`,
          cancelText: 'Tutup',
          confirmText: 'Selesai',
          onConfirm: () => {
            if (selectedClass) fetchStudents(selectedClass);
          }
        });
      } catch (excelError: any) {
        console.error('Import error:', excelError);
        showConfirm({
          title: 'Gagal Impor Excel',
          message: `Gagal memproses file Excel: ${excelError.message || excelError}. Silakan gunakan template ekspor resmi yang sesuai denga format.`,
          cancelText: 'Tutup',
          onConfirm: () => {}
        });
      }
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
    reader.onerror = (err) => {
      showConfirm({
        title: 'Gagal Membaca File',
        message: 'Tidak dapat membaca file Excel tersebut. Pastikan file tidak rusak.',
        cancelText: 'Tutup',
        onConfirm: () => {}
      });
    };

    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
          throw new Error('Lembar kerja pertama Excel kosong atau tidak ditemukan.');
        }

        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
        if (jsonData.length === 0) {
          throw new Error('Tidak ada baris data terdeteksi di dalam file Excel.');
        }

        const updatedStudents = [...studentsList];
        
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

        let importCount = 0;
        let updateCount = 0;

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
            updateCount++;
            targetStudent = { ...updatedStudents[studentIdx], name: nameInExcel }; // Update name with Excel casing
            updatedStudents[studentIdx] = targetStudent;
          } else {
            isNew = true;
            importCount++;
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
          
          // Update the local list as well
          const localIdx = updatedStudents.findIndex(s => s.id === finalStudent.id);
          if (localIdx !== -1) updatedStudents[localIdx] = finalStudent;
        }
        
        setStudentsList(updatedStudents);

        // Save everything at once to backend in a single request instead of sequential setDoc loops!
        if (selectedClass && updatedStudents.length > 0) {
          await fetch('/api/backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              className: selectedClass, 
              students: updatedStudents,
              waliKelas: globalWaliKelas || globalWaliKelasPutra || globalWaliKelasPutri 
            })
          });
        }
        
        showConfirm({
          title: 'Sukses Impor Identitas',
          message: `Berhasil mengimpor identitas! Terbuat ${importCount} santri baru dan terupdate ${updateCount} santri terdaftar dari file Excel.`,
          cancelText: 'Tutup',
          confirmText: 'Selesai',
          onConfirm: () => {
            if (selectedClass) fetchStudents(selectedClass);
          }
        });
      } catch (excelError: any) {
        console.error('Import error:', excelError);
        showConfirm({
          title: 'Gagal Impor Excel',
          message: `Gagal memproses file Excel: ${excelError.message || excelError}. Silakan gunakan template ekspor identitas resmi.`,
          cancelText: 'Tutup',
          onConfirm: () => {}
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSyncSubjects = async () => {
    if (studentsList.length < 2) return;
    
    showConfirm({
      title: 'Sinkronisasi Mata Pelajaran',
      message: 'Ini akan menyamakan daftar mata pelajaran SEMUA santri mengikuti santri pertama. Data nilai santri lain akan tetap aman jika nama mata pelajarannya sama. Lanjutkan?',
      confirmText: 'YA, SINKRONKAN',
      onConfirm: async () => {
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
          showConfirm({
            title: 'Berhasil',
            message: 'Sinkronisasi Mata Pelajaran Berhasil disinkronkan untuk seluruh santri!',
            cancelText: 'Tutup',
            confirmText: 'Selesai',
            onConfirm: () => {}
          });
        } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, 'students');
        } finally {
          setIsSyncing(false);
        }
      }
    });
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

  if (isAdminViewActive) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        {/* Admin Navigation Bar */}
        <header className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white py-6 px-8 flex items-center justify-between no-print shadow-lg shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center text-2xl border border-white/20">
              👑
            </div>
            <div>
              <h1 className="text-sm font-black uppercase tracking-wider">DASBOR ADMINISTRATOR AL-HIKMAH</h1>
              <p className="text-[10px] text-blue-200/80 font-bold uppercase tracking-widest mt-0.5">Sistem Integrasi Akun Guru & Monitoring Nilai Terpusat</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-[9px] text-blue-200/60 font-black uppercase tracking-wider">Sudah Masuk Sebagai:</span>
              <span className="text-[11px] font-black text-amber-400 capitalize">{currentUserEmail}</span>
            </div>
            
            <button 
              onClick={handleLogout}
              className="px-5 py-2.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white font-extrabold text-[10px] tracking-wider uppercase rounded-xl transition-all border border-white/10 cursor-pointer flex items-center gap-2"
            >
              <LogOut size={14} /> Keluar Dasbor
            </button>
          </div>
        </header>

        {/* Tab Selection */}
        <div className="bg-white border-b border-slate-200 py-4 px-6 md:px-8 flex justify-center no-print shrink-0">
          <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full max-w-md border border-slate-200/60 shadow-inner">
            <button 
              onClick={() => setAdminSubTab('stats')}
              className={`flex-1 py-3 text-[10px] font-black text-center uppercase tracking-widest rounded-xl transition-all duration-200 ${
                adminSubTab === 'stats' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              📊 Pemantauan Kelas
            </button>
            <button 
              onClick={() => {
                setAdminSubTab('teachers');
                fetchTeachers();
              }}
              className={`flex-1 py-3 text-[10px] font-black text-center uppercase tracking-widest rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 ${
                adminSubTab === 'teachers' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              👤 Kelola Akun Guru
            </button>
          </div>
        </div>

        {/* Main Dashboard Workspace */}
        <main className="flex-grow p-6 md:p-10 max-w-7xl w-full mx-auto space-y-8 animate-in fade-in duration-300 overflow-y-auto">
          {adminSubTab === 'stats' ? (
            <>
              {/* Quick Statistics Overview Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-[28px] border border-slate-100 shadow-sm flex items-center gap-5">
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl font-bold">
                🏫
              </div>
              <div>
                <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Total Kelas</p>
                <p className="text-2xl font-black text-slate-800 leading-tight">10 Kelas</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[28px] border border-slate-100 shadow-sm flex items-center gap-5">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl font-bold">
                ✅
              </div>
              <div>
                <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Kelas Sudah Mengisi</p>
                <p className="text-2xl font-black text-slate-800 leading-tight">
                  {adminClassesStats.filter(c => c.hasData).length} Kelas
                </p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[28px] border border-slate-100 shadow-sm flex items-center gap-5">
              <div className="w-14 h-14 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center text-2xl font-bold">
                ⏳
              </div>
              <div>
                <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Kelas Belum Mengisi</p>
                <p className="text-2xl font-black text-slate-800 leading-tight">
                  {adminClassesStats.filter(c => !c.hasData).length} Kelas
                </p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[28px] border border-slate-100 shadow-sm flex items-center gap-5">
              <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center text-2xl font-bold">
                👨‍🎓
              </div>
              <div>
                <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Total Santri Terdata</p>
                <p className="text-2xl font-black text-slate-800 leading-tight">
                  {adminClassesStats.reduce((acc, c) => acc + (c.studentCount || 0), 0)} Santri
                </p>
              </div>
            </div>
          </div>

          {/* Classes Status List */}
          <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6 md:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Status Pengisian Lintas Kelas</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Daftar kelas beserta Wali Kelas dan jumlah input data.</p>
              </div>

              <button 
                onClick={fetchAdminStats}
                disabled={isAdminDataLoading}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all flex items-center gap-2"
              >
                🔄 Refresh Data
              </button>
            </div>

            {isAdminDataLoading ? (
              <div className="py-20 flex flex-col items-center justify-center">
                <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4">Menghubungkan ke Database...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {adminClassesStats.map(cls => (
                  <div 
                    key={cls.name}
                    className="border border-slate-100 hover:border-slate-200 hover:bg-slate-50/40 rounded-[24px] p-5 transition-all space-y-4 text-slate-700"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        {/* Class Identifier Icon */}
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm uppercase ${
                          cls.hasData ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-105 text-slate-400'
                        }`}>
                          {cls.name.split(' ')[0]}
                        </div>
                        
                        <div>
                          <h4 className="text-sm font-black text-slate-700 uppercase tracking-tight">KELAS {cls.name}</h4>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                            Wali Kelas: <span className="text-slate-600 font-extrabold">{cls.waliKelas || '-'}</span>
                          </p>
                        </div>
                      </div>

                      {/* Status Badges & Quick Details */}
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-right hidden sm:block mr-2">
                          <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Terakhir Diperbarui</p>
                          <p className="text-[10px] font-extrabold text-slate-500 uppercase mt-0.5">
                            {cls.updatedAt ? new Date(cls.updatedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB' : '-'}
                          </p>
                        </div>

                        {cls.hasData ? (
                          <span className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-full text-[9px] font-black tracking-wider uppercase border border-emerald-100 flex items-center gap-1.5 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            SUDAH MENGISI ({cls.studentCount} Santri)
                          </span>
                        ) : (
                          <span className="px-4 py-2 bg-slate-50 text-slate-500 rounded-full text-[9px] font-black tracking-wider uppercase border border-slate-200/50 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                            BELUM MENGISI
                          </span>
                        )}

                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              setIsAdminViewActive(false);
                              handleSelectClass(cls.name);
                            }}
                            className="p-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white/95 rounded-xl transition-all cursor-pointer text-xs font-bold uppercase flex items-center gap-1.5 shadow-sm border border-indigo-500/10"
                            title="Audit / Edit Nilai dan Data Kelas"
                          >
                            <span>✏️</span> AUDIT & EDIT
                          </button>

                          <button 
                            onClick={() => handleViewAdminClassDetail(cls.name)}
                            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer text-xs font-bold uppercase flex items-center gap-1.5 border border-slate-200/40 shadow-sm"
                            title="Tampilkan Santri"
                          >
                            <span>🔍</span> {selectedAdminClassDetail === cls.name ? 'TUTUP' : 'PENGISI & DATA NILAI'}
                          </button>
                          
                          <a 
                            href={`/api/classes-download/${encodeURIComponent(cls.name)}`}
                            className={`p-2.5 rounded-xl transition-all text-xs text-center flex items-center justify-center font-bold uppercase shadow-sm ${
                              cls.hasData 
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-100 cursor-pointer' 
                                : 'bg-slate-50 opacity-40 pointer-events-none text-slate-300'
                            }`}
                            title="Unduh Backup"
                          >
                            📥 JSON
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Class Students Details Panel */}
                    {selectedAdminClassDetail === cls.name && (
                      <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-6 animate-in slide-in-from-top-3 duration-250 shadow-md">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200/60 pb-4 gap-4">
                          <h5 className="text-[11px] uppercase font-black text-slate-500 tracking-wider flex items-center gap-2">
                            <FileText size={16} className="text-blue-500" /> Ringkasan Nilai Komprehensif Kelas {cls.name} ({adminSelectedClassStudents.length} Santri)
                          </h5>
                          <div className="text-[10px] font-black uppercase text-slate-400">
                            Wali Kelas: <span className="text-indigo-600">{cls.waliKelas || '-'}</span>
                          </div>
                        </div>

                        {adminSelectedClassStudents.length === 0 ? (
                          <p className="text-[10px] font-black text-slate-400 uppercase py-6 text-center tracking-widest">
                            Belum ada santri yang dimasukkan di kelas ini.
                          </p>
                        ) : (
                          <div className="space-y-6">
                            {/* Scrollable Grand Score Spreadsheet Matrix */}
                            <div>
                              <div className="flex items-center gap-1.5 mb-2.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span>
                                <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">MATRIKS MASTER NILAI SANTRI (TULIS / LISAN)</span>
                              </div>
                              <div className="overflow-x-auto border border-slate-200 rounded-2xl max-h-[400px] overflow-y-auto shadow-inner bg-slate-50/50">
                                <table className="w-full text-left text-[10px] font-black text-slate-600 border-collapse">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-slate-500 uppercase text-[8px] tracking-wider font-black bg-slate-100/80 sticky top-0 z-10">
                                      <th className="py-3 px-4 w-12 text-center bg-slate-100/90 shadow-[0_1px_0_rgba(226,232,240,1)]">No</th>
                                      <th className="py-3 px-4 min-w-[160px] bg-slate-100/90 shadow-[0_1px_0_rgba(226,232,240,1)]">Nama Santri</th>
                                      <th className="py-3 px-4 w-28 bg-slate-100/90 font-mono shadow-[0_1px_0_rgba(226,232,240,1)]">NO INDUK</th>
                                      <th className="py-3 px-4 text-center bg-slate-100/95 shadow-[0_1px_0_rgba(226,232,240,1)]">Al-Qur'an</th>
                                      <th className="py-3 px-4 text-center bg-slate-100/95 shadow-[0_1px_0_rgba(226,232,240,1)]">Tajwid</th>
                                      <th className="py-3 px-4 text-center bg-slate-100/95 shadow-[0_1px_0_rgba(226,232,240,1)]">Fiqih</th>
                                      <th className="py-3 px-4 text-center bg-slate-100/95 shadow-[0_1px_0_rgba(226,232,240,1)]">Tauhid</th>
                                      <th className="py-3 px-4 text-center bg-slate-100/95 shadow-[0_1px_0_rgba(226,232,240,1)]">Hadits</th>
                                      <th className="py-3 px-4 text-center bg-slate-100/95 shadow-[0_1px_0_rgba(226,232,240,1)]">Akhlaq</th>
                                      <th className="py-3 px-4 text-center bg-slate-100/95 shadow-[0_1px_0_rgba(226,232,240,1)]">Tarikh/Sirah</th>
                                      <th className="py-3 px-4 text-center bg-slate-100/95 shadow-[0_1px_0_rgba(226,232,240,1)]">Bahasa Arab</th>
                                      <th className="py-3 px-4 text-center bg-slate-100/95 shadow-[0_1px_0_rgba(226,232,240,1)]">Imla/Khat</th>
                                      <th className="py-3 px-4 text-center bg-slate-100/95 shadow-[0_1px_0_rgba(226,232,240,1)]">Nahwu/Shorof</th>
                                      <th className="py-3 px-4 text-center bg-slate-100/95 shadow-[0_1px_0_rgba(226,232,240,1)]">Tahfidz</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {adminSelectedClassStudents.map((s, idx) => {
                                      const getSubj = (name: string) => {
                                        const sub = (s.subjects || []).find((x: any) => x.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(x.name.toLowerCase()));
                                        if (!sub) return { tulis: '-', lisan: '-' };
                                        return {
                                          tulis: sub.tulis?.nilai !== undefined ? sub.tulis.nilai : '-',
                                          lisan: sub.lisan?.nilai !== undefined ? sub.lisan.nilai : '-'
                                        };
                                      };

                                      return (
                                        <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-100/40 bg-white select-none transition-colors">
                                          <td className="py-3 px-4 text-slate-400 font-extrabold text-center border-r border-slate-100">{idx + 1}</td>
                                          <td className="py-3 px-4 text-slate-800 font-black uppercase text-[10px] tracking-tight border-r border-slate-105">{s.name}</td>
                                          <td className="py-3 px-4 text-slate-500 font-mono text-[9px] border-r border-slate-100">{s.nomorInduk || '-'}</td>
                                          {[
                                            'Al-Qur\'an', 'Tajwid', 'Fiqih', 'Tauhid', 'Hadits',
                                            'Akhlaq', 'Tarikh', 'Bahasa Arab', 'Imla', 'Nahwu', 'Tahfidz'
                                          ].map(subName => {
                                            const scoreInfo = getSubj(subName);
                                            return (
                                              <td key={subName} className="py-2.5 px-3 text-center border-r border-slate-100">
                                                <div className="flex flex-col items-center justify-center gap-0.5">
                                                  <span className="text-slate-700 font-bold">T: {scoreInfo.tulis}</span>
                                                  <span className="text-indigo-600/80 text-[8px] font-black">L: {scoreInfo.lisan}</span>
                                                </div>
                                              </td>
                                            );
                                          })}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {/* Attendance and data completeness */}
                            <div>
                              <div className="flex items-center gap-1.5 mb-2.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                                <span className="text-[9px] font-black uppercase text-slate-450 tracking-wider">DAFTAR ABSENSI & KELENGKAPAN DATA</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {adminSelectedClassStudents.map(s => {
                                  const activeAttendance = s.behavior || { sick: 0, permission: 0, alfa: 0 };
                                  const subjectsCount = s.subjects ? s.subjects.length : 0;
                                  const hasIdentity = s.identity && s.identity.fullName;
                                  return (
                                    <div key={s.id} className="flex justify-between items-center bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
                                      <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-slate-800 uppercase">{s.name}</span>
                                        <span className="text-[8px] font-bold text-slate-400 mt-0.5">NIS: {s.nomorInduk || '-'}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <div className="flex gap-1.5">
                                          {subjectsCount > 0 ? (
                                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[8px] uppercase tracking-wider font-black border border-emerald-100">
                                              {subjectsCount} Nilai
                                            </span>
                                          ) : (
                                            <span className="px-2 py-0.5 bg-rose-50 text-rose-500 rounded text-[8px] uppercase tracking-wider font-black border border-rose-100">
                                              Kosong
                                            </span>
                                          )}
                                          {hasIdentity ? (
                                            <span className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded text-[8px] uppercase tracking-wider font-black border border-purple-100">
                                              ID OK
                                            </span>
                                          ) : (
                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-400 rounded text-[8px] uppercase tracking-wider font-black">
                                              ID Kosong
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-[9px] font-black text-slate-500 uppercase bg-white border border-slate-150 px-2.5 py-1 rounded-lg">
                                          🤒 S: {activeAttendance.sick || 0} | ✉️ I: {activeAttendance.permission || 0} | 🚫 A: {activeAttendance.alfa || 0}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* --- Tab 2: Manage Accounts of teachers inside App ---- */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-350">
              
              {/* Teacher Form Card - Left Column */}
              <div className="lg:col-span-12 xl:col-span-5 bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6">
                <div>
                  <h3 className="text-sm font-black text-slate-850 uppercase tracking-tight flex items-center gap-2">
                    {editingTeacherUsername ? '✍️ EDIT DATA GURU' : '👤 INPUT DATA GURU & TUGAS WALI KELAS'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Cukup masukkan nama lengkap guru dan tentukan kelas binaannya. Sistem akan langsung mendaftarkan guru secara otomatis.</p>
                </div>

                <form onSubmit={handleSaveTeacher} className="space-y-4">
                  <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block">Nama Lengkap Guru</label>
                    <input 
                      type="text"
                      required
                      className="w-full px-4 py-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-bold text-slate-700"
                      placeholder="Contoh: Ustadz Ahmad Syarif, S.Pd..."
                      value={teacherFormName}
                      onChange={e => setTeacherFormName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block">Wali Kelas Untuk Pendidikan</label>
                    <select
                      className="w-full px-4 py-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-bold text-slate-700"
                      required
                      value={teacherFormWaliKelas}
                      onChange={e => setTeacherFormWaliKelas(e.target.value)}
                    >
                      <option value="">-- Pilih Kelas Wali --</option>
                      {CLASSES.map(cls => (
                        <option key={cls} value={cls}>Kelas {cls}</option>
                      ))}
                    </select>
                  </div>

                  {authError && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-[9px] font-black uppercase text-rose-500">
                      ⚠️ {authError}
                     </div>
                  )}

                  <div className="pt-2">
                    {autoSaveStatus === 'incomplete' && (
                      <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-2xl flex items-center gap-3">
                        <span className="text-xl animate-pulse">✍️</span>
                        <div className="text-left">
                          <span className="text-[10px] font-black uppercase text-slate-500 block leading-tight">MENUNGGU INPUT LENGKAP</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mt-0.5">
                            Lengkapi Nama Lengkap Guru dan Kelas Wali binaannya
                          </span>
                        </div>
                      </div>
                    )}

                    {autoSaveStatus === 'ready' && (
                      <div className="p-4 bg-amber-50/70 border border-amber-200/50 rounded-2xl flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xl animate-bounce">⚡</span>
                          <div className="text-left">
                            <span className="text-[10px] font-black uppercase text-amber-700 block leading-tight">SIAP DIDAFTARKAN OTOMATIS</span>
                            <span className="text-[9px] font-extrabold text-amber-600 uppercase tracking-wide block mt-0.5">
                              Sistem mendeteksi data lengkap... Menyimpan dalam 1 detik
                            </span>
                          </div>
                        </div>
                        <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}

                    {autoSaveStatus === 'saving' && (
                      <div className="p-4 bg-blue-50/70 border border-blue-200/50 rounded-2xl flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xl animate-pulse">⏳</span>
                          <div className="text-left">
                            <span className="text-[10px] font-black uppercase text-blue-700 block leading-tight">SEDANG MENDAFTARKAN GURU</span>
                            <span className="text-[9px] font-extrabold text-blue-600 uppercase tracking-wide block mt-0.5 animate-pulse">
                              Menghubungi database ponpes Al-Hikmah...
                            </span>
                          </div>
                        </div>
                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}

                    {autoSaveStatus === 'saved' && (
                      <div className="p-4 bg-emerald-50 border border-emerald-200/50 rounded-2xl flex items-center gap-3 animate-bounce">
                        <span className="text-xl">✅</span>
                        <div className="text-left">
                          <span className="text-[10px] font-black uppercase text-emerald-700 block leading-tight">BERHASIL DIDAFARKAN/DIPERBARUI!</span>
                          <span className="text-[9px] font-extrabold text-emerald-600 uppercase tracking-wide block mt-0.5">
                            Sistem langsung mendaftarkan guru dengan nama & kelas wali
                          </span>
                        </div>
                      </div>
                    )}

                    {autoSaveStatus === 'error' && (
                      <div className="p-4 bg-rose-50 border border-rose-250 rounded-2xl flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                          <span className="text-xl mt-0.5">⚠️</span>
                          <div className="text-left">
                            <span className="text-[10px] font-black uppercase text-rose-700 block leading-tight">GAGAL MENDAFTARKAN GURU</span>
                            <span className="text-[9px] font-extrabold text-rose-600 uppercase tracking-wide block mt-0.5">
                              {autoSaveErrorMessage || "Terjadi kesalahan sistem."}
                            </span>
                          </div>
                        </div>
                        <span className="text-[8px] text-rose-450 font-extrabold uppercase mt-1 block">Perbaiki data di atas agar sistem mencoba menyimpan ulang secara otomatis.</span>
                      </div>
                    )}
                  </div>

                  {editingTeacherUsername && (
                    <div className="pt-2">
                      <button 
                        type="button"
                        onClick={() => {
                          setTeacherFormName('');
                          setTeacherFormUsername('');
                          setTeacherFormPassword('');
                          setTeacherFormWaliKelas('');
                          setEditingTeacherUsername(null);
                          setAutoSaveStatus('incomplete');
                        }}
                        className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 text-[10px] font-black tracking-wider uppercase rounded-xl transition-all border border-slate-200 cursor-pointer text-center"
                      >
                        Batal Mode Edit (Kembali ke Daftar Guru Baru)
                      </button>
                    </div>
                  )}
                </form>
              </div>

              {/* Registered Teachers List - Right Column */}
              <div className="lg:col-span-12 xl:col-span-7 bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                    👤 Guru Kelas & Wali Kelas Terdaftar
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Daftar Guru binaan Pondok Pesantren Modern Al-Hikmah terintegrasi.</p>
                </div>

                {isTeachersLoading ? (
                  <div className="py-16 text-center">
                    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="text-[10px] font-black text-slate-400 uppercase mt-4 tracking-widest">Memuat database guru...</p>
                  </div>
                ) : teachersList.length === 0 ? (
                  <div className="py-20 text-center border-2 border-dashed border-slate-100 rounded-3xl">
                    <span className="text-3xl block filter grayscale mb-2">👤</span>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Belum ada akun Guru yang didaftarkan.</p>
                    <p className="text-[9px] text-slate-400 uppercase mt-1">Gunakan formulir sebelah kiri untuk membuat akun pertama.</p>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {teachersList.map((teacher) => (
                      <div 
                        key={teacher.username} 
                        className="flex items-center justify-between p-4.5 bg-slate-50/60 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all shadow-sm"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-indigo-50 text-indigo-700 rounded-xl flex items-center justify-center font-bold text-sm uppercase">
                            {(teacher.name || teacher.username).charAt(0)}
                          </div>
                          <div>
                            <span className="text-[10px] tracking-widest font-extrabold text-indigo-500 uppercase font-sans">GURU WALI KELAS</span>
                            <h4 className="text-xs font-black text-slate-800 capitalize leading-tight mt-0.5">{teacher.name || teacher.username}</h4>
                            <p className="text-[9px] font-bold text-slate-400 uppercase leading-none mt-1">
                              Tugas Wali Kelas: <span className="text-slate-600 font-extrabold">Kelas {teacher.waliKelas}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingTeacherUsername(teacher.username);
                              setTeacherFormName(teacher.name || teacher.username);
                              setTeacherFormWaliKelas(teacher.waliKelas);
                            }}
                            className="p-2 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-all uppercase font-black text-[9px] tracking-wider cursor-pointer border border-slate-200"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteTeacher(teacher.username)}
                            className="p-2 px-3.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors uppercase font-black text-[9px] tracking-wider cursor-pointer border border-rose-100"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </main>
      </div>
    );
  }

  if (!selectedClass) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4 font-sans relative overflow-x-hidden">
        {/* Beautiful fullcolor background decorations */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full pointer-events-none blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-500/10 rounded-full pointer-events-none blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/5 rounded-full pointer-events-none blur-3xl"></div>

        <motion.div 
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="max-w-xl w-full bg-white rounded-[40px] shadow-[0_32px_80px_rgba(8,112,184,0.12)] overflow-hidden border border-blue-50 z-10 duration-300"
        >
          {/* Header section with rich fullcolor gradients */}
          <div className="bg-gradient-to-br from-emerald-600 via-blue-700 to-indigo-950 p-10 text-center text-white relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-15 pointer-events-none">
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-teal-400 via-transparent to-transparent"></div>
            </div>
            <div className="relative z-10">
              <div className="bg-white/15 w-24 h-24 rounded-[28px] rotate-12 flex items-center justify-center mx-auto mb-5 backdrop-blur-md border border-white/20 shadow-xl overflow-hidden p-3 transition-transform hover:scale-105 duration-350">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-contain -rotate-12" />
                ) : (
                  <div className="text-white/40 text-[10px] font-black uppercase -rotate-12 tracking-wider">Al-Hikmah</div>
                )}
              </div>
              <h1 className="text-2xl font-black tracking-tight uppercase leading-none">E-RAPORT AL-HIKMAH</h1>
              <p className="text-emerald-250 text-[10px] mt-2.5 font-bold tracking-[0.25em] uppercase">PONDOK PESANTREN MODERN AL-HIKMAH</p>
            </div>
          </div>
          
          <div className="p-8 md:p-12 space-y-8">
            <div className="text-center space-y-2">
              <span className="px-3.5 py-1.5 bg-emerald-500/10 text-emerald-700 border border-emerald-500/25 rounded-full font-black text-[9px] uppercase tracking-widest inline-block leading-none">
                Sistem Penilaian Kelas Terdistribusi
              </span>
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">PILIH BIMBINGAN KELAS ANDA</h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wide">Silakan tentukan kelas wali binaan Anda di bawah ini:</p>
            </div>

            {/* FULLCOLOR BEAUTIFUL DROPDOWN SELECTOR */}
            <div className="space-y-4">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 via-blue-600 to-indigo-600 rounded-2xl blur opacity-25 group-hover:opacity-45 transition duration-1000 group-hover:duration-200"></div>
                <div className="relative bg-white rounded-2xl p-1">
                  <select
                    className="w-full px-5 py-4 text-xs font-black text-slate-705 uppercase bg-slate-50 border border-transparent rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-350 cursor-pointer"
                    onChange={(e) => {
                      if (e.target.value) {
                        handleSelectClass(e.target.value);
                      }
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled className="text-slate-400">-- Pilih Kelas Binaan --</option>
                    {CLASSES.map((cls) => {
                      return (
                        <option 
                          key={cls} 
                          value={cls} 
                          className="font-bold text-slate-800 uppercase text-xs py-2 bg-white"
                        >
                          📚 Kelas {cls}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Category Interaction Selector */}
              <div className="grid grid-cols-3 gap-3 pt-4">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSelectedCategory(selectedCategory === 'MTs' ? 'all' : 'MTs')}
                  className={`rounded-2xl p-4 text-center border transition-all cursor-pointer shadow-sm ${
                    selectedCategory === 'MTs' 
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-md shadow-emerald-150' 
                      : 'bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/25 text-emerald-800'
                  }`}
                >
                  <span className="text-xl block mb-1">🟢</span>
                  <span className={`block text-[10px] font-black uppercase leading-none tracking-tight ${
                    selectedCategory === 'MTs' ? 'text-white' : 'text-emerald-850'
                  }`}>MTs</span>
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSelectedCategory(selectedCategory === 'SMP' ? 'all' : 'SMP')}
                  className={`rounded-2xl p-4 text-center border transition-all cursor-pointer shadow-sm ${
                    selectedCategory === 'SMP' 
                      ? 'bg-blue-600 text-white border-blue-700 shadow-md shadow-blue-150' 
                      : 'bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/25 text-blue-800'
                  }`}
                >
                  <span className="text-xl block mb-1">🔵</span>
                  <span className={`block text-[10px] font-black uppercase leading-none tracking-tight ${
                    selectedCategory === 'SMP' ? 'text-white' : 'text-blue-850'
                  }`}>SMP</span>
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSelectedCategory(selectedCategory === 'SMA' ? 'all' : 'SMA')}
                  className={`rounded-2xl p-4 text-center border transition-all cursor-pointer shadow-sm ${
                    selectedCategory === 'SMA' 
                      ? 'bg-indigo-600 text-white border-indigo-700 shadow-md shadow-indigo-150' 
                      : 'bg-indigo-500/5 hover:bg-indigo-500/10 border-indigo-500/25 text-indigo-805'
                  }`}
                >
                  <span className="text-xl block mb-1">🟣</span>
                  <span className={`block text-[10px] font-black uppercase leading-none tracking-tight ${
                    selectedCategory === 'SMA' ? 'text-white' : 'text-indigo-800'
                  }`}>SMA</span>
                </motion.button>
              </div>

              {/* Dynamic Sub-Classes Interactive Selection Grid */}
              {selectedCategory !== 'all' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-3 pt-2 overflow-hidden"
                >
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest block border-b border-slate-100 pb-1.5">
                    📂 Pilih Tingkat Kelas {selectedCategory} Binaan Anda:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                    {CLASSES.filter(cls => cls.includes(selectedCategory)).map((cls) => {
                      const classStats = monitorStats?.classes?.find((c: any) => c.name === cls);
                      const hasData = classStats?.hasData;
                      const count = classStats?.studentCount || 0;
                      return (
                        <motion.button
                          key={cls}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleSelectClass(cls)}
                          className={`p-3.5 rounded-xl border text-left flex items-center justify-between text-xs font-black uppercase tracking-tight transition-all cursor-pointer ${
                            hasData 
                              ? 'bg-emerald-50 hover:bg-emerald-600 hover:text-white border-emerald-100 text-emerald-800' 
                              : 'bg-slate-50 hover:bg-blue-600 hover:text-white border-slate-100 text-slate-700'
                          }`}
                        >
                          <div className="flex flex-col gap-0.5">
                            <span>🏫 Kelas {cls}</span>
                            <span className={`text-[8px] font-extrabold ${hasData ? 'text-emerald-600 hover:text-white/80' : 'text-slate-400'}`}>
                              {hasData ? `✅ Terisi (${count} Santri)` : '⏳ Belum Diinput'}
                            </span>
                          </div>
                          <span>➡️</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Admin entry point buttons */}
            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={() => {
                  setAdminAuthInputEmail('admin@alhikmah.id');
                  setIsAuthModalOpen(true);
                }}
                className="w-full py-4 px-4 bg-gradient-to-r from-slate-900 to-indigo-950 hover:from-black hover:to-indigo-900 text-white font-black text-[10px] tracking-widest uppercase rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2"
              >
                👑 PORTAL PEMANTAUAN TERPUSAT / ADMIN
              </button>
            </div>

            {/* Footer decoration */}
            <div className="text-center pt-2 border-t border-slate-100 flex items-center justify-between text-slate-400">
              <span className="text-[9px] font-black uppercase tracking-widest leading-none">
                ⚡ Auto-Save & Cloud Sync
              </span>
              <span className="text-[9px] font-black uppercase tracking-widest leading-none">
                Versi Terintegrasi (Firestore)
              </span>
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
          {/* Section: Navigasi Mode Halaman */}
          <div className="space-y-1 bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
            <h3 className="text-slate-400 text-[9px] font-black tracking-[0.2em] mb-2 uppercase px-2 flex items-center gap-1.5">
              🚀 NAVIGASI UTAMA
            </h3>
            <button
              onClick={() => {
                setWorkspaceTab('students');
                setIsSidebarOpen(false);
              }}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-3 text-xs font-bold uppercase tracking-wider cursor-pointer ${
                workspaceTab === 'students'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-100/55'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <LucideUser size={15} /> Data & Raport
            </button>
            <button
              onClick={() => {
                setWorkspaceTab('bulk');
                setIsSidebarOpen(false);
              }}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-3 text-xs font-bold uppercase tracking-wider cursor-pointer ${
                workspaceTab === 'bulk'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-100/55'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <LayoutDashboard size={15} /> Input Massal
            </button>
            <button
              onClick={() => {
                setWorkspaceTab('settings');
                setIsSidebarOpen(false);
              }}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-3 text-xs font-bold uppercase tracking-wider cursor-pointer ${
                workspaceTab === 'settings'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-100/55'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Settings size={15} /> Setting Raport
            </button>
          </div>

          {/* Section: Students List */}
          <div className="pt-2">
            <h3 className="text-[10px] uppercase font-black text-slate-400 mb-3 ml-2 flex items-center gap-2">
              <LucideUser size={12} /> Daftar Santri
            </h3>
            
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-semibold"
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
                    onClick={() => {
                      setCurrentIndex(idx);
                      setWorkspaceTab('students');
                      setIsSidebarOpen(false);
                    }}
                    className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group ${workspaceTab === 'students' && currentIndex === idx ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'hover:bg-slate-50 text-slate-600'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${workspaceTab === 'students' && currentIndex === idx ? 'bg-white' : 'bg-slate-300'}`}></div>
                      <span className="text-xs font-bold truncate max-w-[140px]">{s.name}</span>
                    </div>
                    {workspaceTab === 'students' && currentIndex === idx ? <ChevronRight size={14} /> : <div className="w-1.5 h-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-400 rounded-full"></div>}
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
              onClick={() => {
                if (selectedStudent && selectedStudent.id) {
                  handleDeleteStudent(selectedStudent.id);
                }
              }} 
              disabled={filteredStudents.length === 0 || !selectedStudent}
              className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 p-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 lg:cursor-pointer"
            >
              <Trash2 size={16} /> HAPUS DATA
            </button>

            <button 
              onClick={syncToPostgres}
              disabled={filteredStudents.length === 0}
              className={`w-full ${syncStatus === 'syncing' ? 'bg-amber-500' : syncStatus === 'success' ? 'bg-emerald-600 shadow-emerald-100' : 'bg-slate-700 hover:bg-slate-800 shadow-slate-100'} text-white p-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg hover:translate-y-[-1px] disabled:opacity-50 cursor-pointer`}
            >
              <Save size={16} className={`${syncStatus === 'syncing' ? 'animate-spin' : ''}`} /> 
              {syncStatus === 'syncing' ? 'SINKRONISASI POSTGRES...' : syncStatus === 'success' ? 'SINKRONISASI BERHASIL' : 'SINKRONISASI DATABASE'}
            </button>
          </div>
        </div>

          <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 p-4 rounded-2xl border border-emerald-550/10 text-center mt-4">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] uppercase font-black tracking-widest text-emerald-800">Database Unlimited</span>
            </div>
            <p className="text-[9px] font-bold text-emerald-600 uppercase">Kapasitas: Tanpa Batas AKTIF</p>
          </div>

        <div className="pb-6 pt-4 border-t border-slate-100 flex flex-col gap-3">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 flex flex-col gap-2.5">
            <h4 className="text-[10px] font-black uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
              📄 Pilihan Lembar Cetak
            </h4>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={selectedPrintSheets.cover} 
                  onChange={e => setSelectedPrintSheets(prev => ({ ...prev, cover: e.target.checked }))}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Halaman Cover</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={selectedPrintSheets.identitas} 
                  onChange={e => setSelectedPrintSheets(prev => ({ ...prev, identitas: e.target.checked }))}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Identitas Santri</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={selectedPrintSheets.nilai} 
                  onChange={e => setSelectedPrintSheets(prev => ({ ...prev, nilai: e.target.checked }))}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Nilai Akademik</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={selectedPrintSheets.sikap} 
                  onChange={e => setSelectedPrintSheets(prev => ({ ...prev, sikap: e.target.checked }))}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Nilai Sikap</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={selectedPrintSheets.kehadiran} 
                  onChange={e => setSelectedPrintSheets(prev => ({ ...prev, kehadiran: e.target.checked }))}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Ekstra & Absensi</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={selectedPrintSheets.legger} 
                  onChange={e => setSelectedPrintSheets(prev => ({ ...prev, legger: e.target.checked }))}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Legger Nilai</span>
              </label>
            </div>
          </div>

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



          <button 
            onClick={handleClearClass}
            className="w-full bg-slate-905 hover:bg-slate-950 text-slate-800 p-4 rounded-xl text-xs font-black flex items-center justify-center gap-3 transition-all border border-slate-200 hover:bg-slate-100 cursor-pointer"
          >
            <ChevronLeft size={18} /> GANTI PILIHAN KELAS
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
        {/* LIVE STATUS MONITOR MODAL */}
        {isMonitorModalOpen && (
          <AnimatePresence>
            <div className="fixed inset-0 z-[250] overflow-y-auto no-print">
              <div className="flex min-h-full items-center justify-center p-4 sm:p-6 md:p-8">
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }} 
                  onClick={() => setIsMonitorModalOpen(false)} 
                  className="fixed inset-0 bg-slate-900/70 backdrop-blur-md" 
                />
                
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 30 }} 
                  animate={{ opacity: 1, scale: 1, y: 0 }} 
                  className="relative w-full max-w-5xl bg-slate-50 rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                >
                  {/* Decorative Banner Header */}
                  <div className="p-8 bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 text-white flex justify-between items-center shrink-0 border-b border-indigo-950/20">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 shadow-inner">
                        <span className="text-2xl">📊</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] bg-emerald-500/35 border border-emerald-400/20 px-2 py-0.5 rounded-full font-black tracking-widest uppercase leading-none text-emerald-100">Live Monitor</span>
                          {monitorStats?.isLocalFallback && (
                            <span className="text-[9px] bg-amber-500/35 border border-amber-400/20 px-2 py-0.5 rounded-full font-black tracking-widest uppercase leading-none text-amber-100">Lokal</span>
                          )}
                        </div>
                        <h2 className="text-xl md:text-2xl font-black tracking-tight uppercase mt-1 leading-none">PEMANTAUAN PENGISIAN RAPORT</h2>
                        <p className="text-xs text-indigo-200/80 font-bold mt-1.5 uppercase leading-none">Status Penginputan Kelas & Cadangan Berkas Al-Hikmah</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setIsMonitorModalOpen(false)} 
                      className="p-2.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-full transition-all cursor-pointer border border-white/10"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Body Wrapper */}
                  <div className="p-8 overflow-y-auto flex-1 space-y-8">
                    {isStatsLoading ? (
                      <div className="py-24 flex flex-col items-center justify-center gap-4">
                        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Sinkronisasi Database Live...</p>
                      </div>
                    ) : (
                      <>
                        {/* Summary Widget Numbers */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="bg-white p-6 rounded-2xl border border-blue-50 shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl font-bold">📂</div>
                            <div>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">KELAS TERKOMPILASI</p>
                              <h3 className="text-xl font-black text-slate-800">{monitorStats?.filledClasses || 0} <span className="text-xs font-medium text-slate-400">dari {monitorStats?.totalClasses || 10} Kelas</span></h3>
                            </div>
                          </div>

                          <div className="bg-white p-6 rounded-2xl border border-emerald-50 shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-xl font-bold">👥</div>
                            <div>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">TOTAL SANTRI DIINPUT</p>
                              <h3 className="text-xl font-black text-slate-800">{monitorStats?.totalStudents || 0} <span className="text-xs font-medium text-slate-400">Orang</span></h3>
                            </div>
                          </div>

                          <div className="bg-white p-6 rounded-2xl border border-indigo-50 shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-xl font-bold">⚡</div>
                            <div>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">METODE KOORDINASI</p>
                              <h3 className={`text-xs font-black flex items-center gap-1.5 ${monitorStats?.isLocalFallback ? 'text-amber-600' : 'text-emerald-600'}`}>
                                <span className={`w-2.5 h-2.5 rounded-full inline-block animate-ping ${monitorStats?.isLocalFallback ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                                {monitorStats?.isLocalFallback ? 'OFFLINE CACHE (MANDIRI)' : 'SERVER CENTRAL PORTAL'}
                              </h3>
                            </div>
                          </div>
                        </div>

                        {/* Search Bar inside Monitor Dashboard */}
                        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                              <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">🔍 Cari Santri di Semua Kelas</h4>
                              <p className="text-[11px] text-slate-400 font-semibold uppercase">Mencari nama dikoordinatkan di semua tingkat kelas yang sudah terisi</p>
                            </div>
                            <div className="w-full md:max-w-md">
                              <input 
                                type="text" 
                                placeholder="Ketik nama santri/NISN disini..." 
                                value={monitorSearchQuery}
                                onChange={(e) => setMonitorSearchQuery(e.target.value)}
                                className="w-full px-5 py-3 outline-none border border-slate-200 focus:border-blue-500 rounded-2xl text-xs font-bold transition-all focus:ring-4 focus:ring-blue-50 bg-slate-50 focus:bg-white"
                              />
                            </div>
                          </div>

                          {/* Search Results */}
                          {monitorSearchResults.length > 0 && (
                            <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 space-y-3">
                              <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest">🔍 HASIL PENCARIAN DI SEMUA KELAS ({monitorSearchResults.length}):</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 max-h-48 overflow-y-auto">
                                {monitorSearchResults.map((st: any) => (
                                  <div key={st.id} className="bg-white p-3.5 rounded-xl border border-blue-100 shadow-sm flex flex-col justify-center">
                                    <span className="text-xs font-black text-slate-800 uppercase">{st.name}</span>
                                    <span className="text-[9px] text-slate-400 font-semibold font-mono mt-0.5">NISN/NI: {st.nomorInduk || '-'}</span>
                                    <span className="mt-2 inline-block self-start text-[8px] font-extrabold tracking-widest text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md uppercase border border-blue-100/50 leading-none">💻 KELAS {st.className}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {monitorSearchQuery.length >= 2 && monitorSearchResults.length === 0 && (
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
                              <p className="text-xs font-semibold text-slate-400 uppercase">Tidak ada santri yang cocok dari kelas yang tersimpan lokal</p>
                            </div>
                          )}
                        </div>

                        {/* Classes Grid Layout */}
                        <div className="space-y-4">
                          <h4 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest">Detail Tingkat Kelas</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {monitorStats?.classes?.map((cls: any) => (
                              <div 
                                key={cls.name} 
                                className={`bg-white rounded-3xl p-6 border ${cls.hasData ? 'border-emerald-100 shadow-lg shadow-emerald-50/40' : 'border-slate-200'} transition-all hover:translate-y-[-2px] flex flex-col justify-between`}
                              >
                                <div>
                                  <div className="flex items-center justify-between mb-4">
                                    <span className="px-3.5 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-black tracking-widest uppercase">{cls.name}</span>
                                    {cls.hasData ? (
                                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-wider rounded-lg border border-emerald-100 flex items-center gap-1.5 leading-none">🟢 TERISI</span>
                                    ) : (
                                      <span className="px-2.5 py-1 bg-slate-50 text-slate-400 text-[9px] font-black uppercase tracking-wider rounded-lg border border-slate-200/60 flex items-center gap-1.5 leading-none">❌ KOSONG</span>
                                    )}
                                  </div>

                                  <div className="space-y-2 py-4 border-y border-slate-100/80 my-4 text-xs">
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-400 font-bold uppercase text-[9px]">Wali Kelas:</span>
                                      <span className="text-slate-700 font-black uppercase max-w-[150px] truncate">{cls.waliKelas || '-'}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-400 font-bold uppercase text-[9px]">Santri Terinput:</span>
                                      <span className="text-slate-800 font-black">{cls.studentCount} Santri</span>
                                    </div>
                                    {cls.updatedAt && (
                                      <div className="flex justify-between items-center">
                                        <span className="text-slate-400 font-bold uppercase text-[9px]">Pembaruan:</span>
                                        <span className="text-slate-500 font-bold font-mono text-[9px]">{new Date(cls.updatedAt).toLocaleString('id-ID')}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="mt-2">
                                  {cls.hasData ? (
                                    <button
                                      onClick={() => {
                                        window.open(`/api/classes-download/${encodeURIComponent(cls.name)}`, '_blank');
                                      }}
                                      className="w-full text-center py-2.5 bg-blue-50 text-blue-600 font-black text-[9px] tracking-wider uppercase rounded-xl border border-blue-100 hover:bg-blue-100 transition-all cursor-pointer"
                                    >
                                      📥 Unduh Cadangan JSON
                                    </button>
                                  ) : (
                                    <button 
                                      disabled 
                                      className="w-full py-2.5 bg-slate-50 text-slate-300 font-black text-[9px] tracking-wider uppercase rounded-xl border border-slate-200/40 cursor-not-allowed"
                                    >
                                      Belum Diinput
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Modal Footer */}
                  <div className="p-6 bg-white border-t border-slate-100 flex items-center justify-between font-bold text-slate-400 uppercase text-[9px] tracking-widest shrink-0">
                    <span>Yayasan Pendidikan Islam Al-Hikmah</span>
                    <span>Monitoring & Kontrol Terintegrasi</span>
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
                                onChange={e => handleBulkUpdateExtra(s.id, 0, 'activity', e.target.value.toUpperCase(), false)}
                                onBlur={e => handleBulkUpdateExtra(s.id, 0, 'activity', e.target.value.toUpperCase(), true)}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input 
                                className="w-full bg-transparent border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 focus:bg-white focus:ring-2 focus:ring-blue-100 rounded-lg outline-none"
                                placeholder="..."
                                value={s.extracurriculars?.[0]?.note || ''}
                                onChange={e => handleBulkUpdateExtra(s.id, 0, 'note', e.target.value, false)}
                                onBlur={e => handleBulkUpdateExtra(s.id, 0, 'note', e.target.value, true)}
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
                                onChange={e => handleBulkUpdateBehavior(s.id, 'spiritual', e.target.value, false)}
                                onBlur={e => handleBulkUpdateBehavior(s.id, 'spiritual', e.target.value, true)}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <textarea 
                                className="w-full bg-transparent border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 focus:bg-white focus:ring-2 focus:ring-blue-100 rounded-lg outline-none min-h-[60px] resize-none"
                                placeholder="..."
                                value={s.behavior.social || ''}
                                onChange={e => handleBulkUpdateBehavior(s.id, 'social', e.target.value, false)}
                                onBlur={e => handleBulkUpdateBehavior(s.id, 'social', e.target.value, true)}
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
                            {saveStatus === 'error' && saveErrorMessage && (
                              <span className="text-[10px] text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full font-medium" title={saveErrorMessage}>
                                ({saveErrorMessage})
                              </span>
                            )}
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
                    <button 
                      type="button" 
                      onClick={() => {
                        if (currentUserEmail) {
                          setActiveTab('identity');
                        } else {
                          showConfirm({
                            title: 'Akses Terbatas',
                            message: 'Data Identitas Administratif (Nama Orang Tua, Alamat, No HP, dll) dilindungi kebijakan privasi dan hanya bisa dilihat/diedit oleh Pengisi Data / Administrator yang telah masuk.',
                            cancelText: 'Mengerti',
                            confirmText: 'Masuk Sekarang',
                            onConfirm: () => {
                              setIsAuthModalOpen(true);
                            }
                          });
                        }
                      }}
                      className={`px-5 py-2 text-xs font-bold rounded-xl transition-all shrink-0 flex items-center gap-1.5 ${activeTab === 'identity' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                    >
                      <span>Identitas Santri</span>
                      {!currentUserEmail && <span className="text-[10px]">🔒</span>}
                    </button>
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
                                <input className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-medium text-slate-700" value={editingStudent.name || ''} onChange={e => setEditingStudent({...editingStudent, name: e.target.value})} />
                              </div>
                              <div className="form-group col-span-2">
                                <label className="text-xs font-bold text-slate-500 mb-1.5 block">NIS/NISN</label>
                                <input className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-medium text-slate-700" value={editingStudent.nomorInduk || ''} onChange={e => setEditingStudent({...editingStudent, nomorInduk: e.target.value})} />
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
                  currentUserEmail={currentUserEmail}
                  selectedPrintSheets={selectedPrintSheets}
                />
              </div>
            ))}
          </div>
        ) : workspaceTab === 'students' ? (
          selectedStudent ? (
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
                    currentUserEmail={currentUserEmail}
                    selectedPrintSheets={selectedPrintSheets}
                  />
               </div>
            </motion.div>
          ) : (
            <div className="flex-1 overflow-y-auto bg-slate-50 p-6 md:p-10 no-print h-screen flex flex-col justify-center items-center">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-md w-full bg-white p-8 rounded-[32px] border border-slate-100 shadow-md text-center flex flex-col items-center gap-6"
              >
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-3xl shadow-inner animate-bounce">
                  📖
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">RAPORT KELAS {selectedClass}</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1.5 leading-relaxed">
                    Silakan pilih nama santri di bilah samping kiri untuk mulai mengelola nilai, melihat lembar raport, atau mencetaknya.
                  </p>
                </div>
                <div className="w-full flex flex-col gap-2.5 pt-4 border-t border-slate-100">
                  <button
                    onClick={openAddModal}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] tracking-widest uppercase rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Plus size={14} /> TAMBAH SANTRI BARU
                  </button>
                </div>
              </motion.div>
            </div>
          )
        ) : workspaceTab === 'bulk' ? (
          <div className="flex-1 overflow-y-auto bg-slate-50 p-6 md:p-10 no-print min-h-screen flex flex-col">
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {/* Header */}
              <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-2.5">
                  <LayoutDashboard className="text-blue-600" size={24} /> Input Massal - Kelas {selectedClass}
                </h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">Layanan input multi-data secara cepat & efisien untuk seluruh santri sekaligus</p>
              </div>

              {/* Bento Grid layout for Mass Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Card 2: Input Nilai Massal */}
                <div className="bg-white rounded-[28px] p-6 border border-slate-100 hover:border-blue-200 transition-all hover:translate-y-[-2px] hover:shadow-lg hover:shadow-slate-100/50 flex flex-col justify-between">
                  <div>
                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center text-2xl shadow-sm mb-4">🏆</div>
                    <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider font-sans">Input Nilai Massal</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1.5 leading-relaxed">Isi nilai ujian tulis dan lisan santri secara simultan per mata pelajaran.</p>
                  </div>
                  <button 
                    onClick={() => setIsBulkGradesOpen(true)}
                    className="w-full mt-6 py-3 bg-amber-50 hover:bg-amber-100 active:scale-95 text-amber-700 font-extrabold text-[10px] tracking-widest uppercase rounded-xl transition-all border border-amber-100 cursor-pointer text-center font-sans"
                  >
                    Buka Input Nilai
                  </button>
                </div>

                {/* Card 3: Input Identitas Massal */}
                <div className="bg-white rounded-[28px] p-6 border border-slate-100 hover:border-indigo-200 transition-all hover:translate-y-[-2px] hover:shadow-lg hover:shadow-slate-100/50 flex flex-col justify-between">
                  <div>
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl shadow-sm mb-4">📋</div>
                    <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider font-sans">Input Identitas Massal</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1.5 leading-relaxed">Update No Induk, NISN, TTL, nama orang tua, alamat secara kooperatif sekaligus.</p>
                  </div>
                  <button 
                    onClick={() => {
                      if (currentUserEmail) {
                        setIsBulkIdentityOpen(true);
                      } else {
                        showConfirm({
                          title: 'Akses Terbatas',
                          message: 'Pengisian / pengeditan data identitas secara massal dilindungi kebijakan privasi dan hanya bisa diakses oleh Pengisi Data / Administrator yang telah masuk.',
                          cancelText: 'Mengerti',
                          confirmText: 'Masuk Sekarang',
                          onConfirm: () => {
                            setIsAuthModalOpen(true);
                          }
                        });
                      }
                    }}
                    className="w-full mt-6 py-3 bg-indigo-50 hover:bg-indigo-100 active:scale-95 text-indigo-600 font-extrabold text-[10px] tracking-widest uppercase rounded-xl transition-all border border-indigo-100 cursor-pointer text-center font-sans relative"
                  >
                    Buka Input Identitas {!currentUserEmail && '🔒'}
                  </button>
                </div>

                {/* Card 4: Input Ekstra Massal */}
                <div className="bg-white rounded-[28px] p-6 border border-slate-100 hover:border-teal-200 transition-all hover:translate-y-[-2px] hover:shadow-lg hover:shadow-slate-100/50 flex flex-col justify-between">
                  <div>
                    <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center text-2xl shadow-sm mb-4">🌟</div>
                    <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider font-sans">Input Ekstra Massal</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1.5 leading-relaxed">Kelola data kegiatan ekstrakurikuler & prestasi untuk seluruh santri.</p>
                  </div>
                  <button 
                    onClick={() => setIsBulkExtraOpen(true)}
                    className="w-full mt-6 py-3 bg-teal-50 hover:bg-teal-100 active:scale-95 text-teal-700 font-extrabold text-[10px] tracking-widest uppercase rounded-xl transition-all border border-teal-100 cursor-pointer text-center font-sans"
                  >
                    Buka Input Ekstra
                  </button>
                </div>

                {/* Card 5: Input Sikap Massal */}
                <div className="bg-white rounded-[28px] p-6 border border-slate-100 hover:border-rose-200 transition-all hover:translate-y-[-2px] hover:shadow-lg hover:shadow-slate-100/50 flex flex-col justify-between">
                  <div>
                    <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center text-2xl shadow-sm mb-4">✨</div>
                    <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider font-sans">Input Sikap Massal</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1.5 leading-relaxed">Masukkan deskripsi perilaku spiritual, sosial, & catatan wali kelas secara massal.</p>
                  </div>
                  <button 
                    onClick={() => setIsBulkBehaviorOpen(true)}
                    className="w-full mt-6 py-3 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-600 font-extrabold text-[10px] tracking-widest uppercase rounded-xl transition-all border border-rose-100 cursor-pointer text-center font-sans"
                  >
                    Buka Input Sikap
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto bg-slate-50 p-6 md:p-10 no-print min-h-screen flex flex-col">
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {/* Header */}
              <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-2.5 font-sans">
                  <Settings className="text-blue-600 animate-spin-slow" size={24} /> Setting Raport - Kelas {selectedClass}
                </h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">Konfigurasi parameter administratif raport kelas, logo instansi, dan kenaikan kelas</p>
              </div>

              {/* Main Settings Card */}
              <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6 md:p-8 space-y-8">
                <div>
                  <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">📋 Identitas Administratif Kelas</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block border-b border-slate-100 pb-1 font-sans">Nama Kelas</label>
                    <input 
                      id="setting_nama_kelas"
                      className="w-full px-4 py-3 text-xs bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500 outline-none transition-all font-bold text-slate-700"
                      placeholder="X (SEPULUH)..."
                      value={globalNamaKelas}
                      onChange={e => handleUpdateGlobalNamaKelas(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block border-b border-slate-100 pb-1 font-sans">Tanggal Raport</label>
                    <input 
                      id="setting_tanggal_raport"
                      className="w-full px-4 py-3 text-xs bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500 outline-none transition-all font-bold text-slate-700"
                      placeholder="20 DESEMBER 2025..."
                      value={globalTanggalRaport}
                      onChange={e => handleUpdateGlobalTanggalRaport(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block border-b border-slate-100 pb-1 font-sans">Nama Wali Kelas</label>
                    <input 
                      id="setting_wali_kelas"
                      className="w-full px-4 py-3 text-xs bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500 outline-none transition-all font-bold text-slate-700"
                      placeholder="NAMA WALI KELAS..."
                      value={globalWaliKelas}
                      onChange={e => handleUpdateGlobalWaliKelas(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block border-b border-slate-100 pb-1 font-sans">Kepala Kepesantrenan</label>
                    <input 
                      id="setting_kepala_kepasentrenan"
                      className="w-full px-4 py-3 text-xs bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500 outline-none transition-all font-bold text-slate-700"
                      placeholder="NAMA KEPALA..."
                      value={globalKepala}
                      onChange={e => handleUpdateGlobalKepala(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block border-b border-slate-100 pb-1 font-sans">Tgl Kenaikan/Kelulusan</label>
                    <input 
                      id="setting_tanggal_kenaikan"
                      className="w-full px-4 py-3 text-xs bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500 outline-none transition-all font-bold text-slate-700"
                      placeholder="21 JUNI 2026..."
                      value={globalTanggalKenaikan}
                      onChange={e => handleUpdateGlobalTanggalKenaikan(e.target.value)}
                    />
                  </div>
                </div>

                {/* Auto-saved status indicator for Report Settings */}
                <div className="flex justify-start sm:justify-end pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block animate-pulse"></span>
                    <span>⚡ Pengaturan Diperbarui Secara Otomatis</span>
                  </div>
                </div>

                {/* Google Sheets Integration Section */}
                <div className="pt-6 border-t border-slate-100 space-y-4">
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                      <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full inline-block"></span>
                      📊 Integrasi Google Sheets (Apps Script)
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 leading-relaxed">
                      Hubungkan pengisian raport Anda langsung dengan Google Sheets menggunakan Google Apps Script Web App URL.
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl space-y-4">
                    <div className="space-y-1.5 w-full">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block border-b border-slate-200 pb-1 font-sans">
                        Google Apps Script Web App URL
                      </label>
                      <input 
                        className="w-full px-4 py-3 text-xs bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 outline-none transition-all font-semibold text-slate-700 font-mono"
                        placeholder="https://script.google.com/macros/s/.../exec"
                        value={googleSheetsUrl}
                        onChange={e => {
                          const val = e.target.value;
                          setGoogleSheetsUrl(val);
                          localStorage.setItem('al_hikmah_google_sheets_url', val);
                        }}
                      />
                    </div>

                    <div className="text-[10.5px] text-slate-500 uppercase leading-relaxed font-semibold font-sans space-y-2 bg-white/70 p-4 rounded-xl border border-slate-100">
                      <p className="text-slate-600 font-bold border-b border-slate-50 pb-1.5 flex items-center gap-1.5">
                        💡 Panduan Cara Deployment Google Web App:
                      </p>
                      <ol className="list-decimal pl-4.5 space-y-1 my-2">
                        <li>Buka Google Sheets & pilih menu <span className="font-bold text-slate-700">Ekstensi &gt; Apps Script</span>.</li>
                        <li>Tempelkan script penerima data (pastikan menggunakan fungsi <span className="font-mono text-emerald-600">doPost(e)</span>).</li>
                        <li>Klik <span className="font-bold text-slate-700">Terapkan &gt; Penerapan Baru</span> (Deploy &gt; New Deployment).</li>
                        <li>Atur jenis penerapan ke <span className="font-bold text-slate-700">Aplikasi Web</span> (Web App), akses ke <span className="font-bold text-rose-600">Siapa saja (Anyone)</span>, lalu salin URL yang diberikan ke kotak input di atas!</li>
                      </ol>
                    </div>
                  </div>
                </div>

                {/* Logo Customizer */}
                <div className="pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div>
                    <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider font-sans">🏫 Kustomisasi Logo Pesantren</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5 leading-relaxed">Sesuaikan logo instansi pondok pesantren Anda yang terpasang di cetakan raport formal.</p>
                  </div>
                  <div className="flex items-center gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center shadow-md overflow-hidden p-1 border border-slate-100 shrink-0 font-sans">
                      {logoUrl ? (
                        <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                      ) : (
                        <Settings size={20} className="text-slate-300" />
                      )}
                    </div>
                    <div className="flex flex-col gap-2 w-full">
                      <label className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-blue-600 border border-blue-100 hover:bg-blue-50 rounded-xl cursor-pointer transition-all shadow-sm text-[10px] font-black uppercase text-center font-sans">
                        <Plus size={14} /> GANTI LOGO
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={handleLogoUpload}
                        />
                      </label>
                      {logoUrl && (
                        <button 
                          onClick={() => {
                            showConfirm({
                              title: 'Hapus Logo Kustom',
                              message: 'Apakah Anda yakin ingin menghapus logo kustom Anda dan kembali ke logo default?',
                              confirmText: 'YA, HAPUS LOGO',
                              onConfirm: () => {
                                setLogoUrl('');
                                localStorage.removeItem('al_hikmah_custom_logo');
                              }
                            });
                          }}
                          className="text-[9px] text-rose-550 hover:text-rose-600 hover:underline transition-all font-black text-center uppercase"
                        >
                          Hapus Logo Kustom
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Promotion Panel / Danger Zone */}
                <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 bg-rose-50/40 p-6 rounded-2xl border border-rose-100/50 font-sans">
                  <div className="text-center sm:text-left">
                    <h4 className="text-xs font-black uppercase text-rose-800 tracking-wider">⚠️ Kenaikan Kelas / Kelulusan</h4>
                    <p className="text-[10px] font-extrabold text-slate-550 uppercase mt-0.5 animate-pulse">harap periksa kembali seluruh data sebelum menaikan kelas / meluluskan santri</p>
                  </div>
                  <button 
                    onClick={handleProcessPromotion}
                    className="px-6 py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] tracking-widest uppercase rounded-xl active:scale-95 transition-all shadow-lg shadow-rose-100 hover:translate-y-[-1px] text-center cursor-pointer font-sans"
                  >
                    Proses Kenaikan/Lulus
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </main>

      {/* PORTAL AUTHENTICATION MODAL */}
      {isAuthModalOpen && (
        <AnimatePresence>
          <div className="fixed inset-0 z-[1000] overflow-y-auto no-print">
            <div className="flex min-h-full items-center justify-center p-4 font-sans">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                onClick={() => setIsAuthModalOpen(false)} 
                className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm" 
              />
              
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }} 
                animate={{ opacity: 1, scale: 1, y: 0 }} 
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl p-8 overflow-hidden border border-slate-100 flex flex-col gap-5 z-10 text-left"
              >
                <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
                  <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center text-xl shadow-inner font-bold">👑</div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Login Portal Admin</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Akses Pemantauan Database Terpusat</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed text-slate-500">
                    Sistem akan mencatat kontribusi koordinasi Anda. Silakan masukkan email administrator Anda untuk memantau pengisian kelas:
                  </p>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block border-b border-slate-100 pb-1 font-sans">Email Administrator</label>
                    <input 
                      type="email"
                      className="w-full px-4 py-3 text-xs bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500 outline-none transition-all font-bold text-slate-700"
                      placeholder="admin@alhikmah.id"
                      value={adminAuthInputEmail}
                      onChange={e => setAdminAuthInputEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-4">
                  <button 
                    onClick={() => setIsAuthModalOpen(false)} 
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold text-[10px] tracking-wider uppercase rounded-xl transition-all cursor-pointer border border-slate-200 text-center"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={handleManualEmailLogin} 
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-extrabold text-[10px] tracking-wider uppercase rounded-xl transition-all shadow-md shadow-blue-200 text-center cursor-pointer"
                  >
                    Masuk Sekarang
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        </AnimatePresence>
      )}

      {/* CUSTOM CONFIRMATION DIALOG MODAL */}
      {confirmModal.isOpen && (
        <AnimatePresence>
          <div className="fixed inset-0 z-[1000] overflow-y-auto no-print">
            <div className="flex min-h-full items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} 
                className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm" 
              />
              
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }} 
                animate={{ opacity: 1, scale: 1, y: 0 }} 
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl p-6 overflow-hidden border border-slate-100 flex flex-col gap-4 text-center z-10"
              >
                <div className="flex flex-col items-center gap-3">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl ${confirmModal.isDanger ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
                    {confirmModal.isDanger ? '⚠️' : 'ℹ️'}
                  </div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight mt-2">{confirmModal.title}</h3>
                  <p className="text-xs text-slate-500 font-bold leading-relaxed">{confirmModal.message}</p>
                </div>

                <div className="flex gap-3.5 mt-2">
                  <button 
                    onClick={() => {
                      setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    }} 
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-600 font-extrabold text-[10px] tracking-wider uppercase rounded-xl transition-all cursor-pointer border border-slate-200/50"
                  >
                    {confirmModal.cancelText || 'Batal'}
                  </button>
                  <button 
                    onClick={() => {
                      setConfirmModal(prev => ({ ...prev, isOpen: false }));
                      confirmModal.onConfirm();
                    }} 
                    className={`flex-1 py-3 active:scale-95 text-white font-extrabold text-[10px] tracking-wider uppercase rounded-xl transition-all shadow-md cursor-pointer ${
                      confirmModal.isDanger 
                        ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-200' 
                        : 'bg-blue-600 hover:bg-blue-500 shadow-blue-200'
                    }`}
                  >
                    {confirmModal.confirmText || 'Konfirmasi'}
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
