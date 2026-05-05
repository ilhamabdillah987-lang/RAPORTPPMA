/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Student, Subject } from './types';
import { ChevronUp, ChevronDown, Printer, UserCircle, Plus, Edit, Trash2, X, Save, LogOut, Lock, User, Search, Settings, LayoutDashboard, FileText, ChevronRight, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// No server needed, data is stored in LocalStorage
const STORAGE_KEY = 'al_hikmah_students_data';

// Helper to get all students from local storage
const getStoredStudents = (): Student[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

// Helper to save students to local storage
const saveStoredStudents = (students: Student[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
};

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

const slideIn = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3 } }
};

const Header = ({ logoUrl }: { logoUrl: string }) => (
  <div className="text-center mb-2 double-border-bottom relative">
    <div className="flex items-center justify-center gap-4 py-2">
      {logoUrl ? (
        <img src={logoUrl} width="80" alt="Logo" className="w-18 h-18 object-contain" referrerPolicy="no-referrer" />
      ) : (
        <div className="w-18 h-18 bg-slate-100 rounded-xl flex items-center justify-center text-[8pt] text-slate-400 font-bold border-2 border-dashed border-slate-200 uppercase">Logo</div>
      )}
      <div>
        <h1 className="text-[11pt] font-bold uppercase leading-tight">YAYASAN PENDIDIKAN ISLAM AL-HIKMAH</h1>
        <h2 className="text-[13pt] font-bold uppercase leading-tight">PESANTREN MODERN AL-HIKMAH</h2>
        <p className="text-[7.5pt] font-medium">Jl. Al-Hikmah Kp. Pondok Jaya RT.05/01 Desa Pondok Jaya Kecamatan Sepatan</p>
        <p className="text-[7.5pt] font-medium">Kabupaten Tangerang Provinsi Banten</p>
      </div>
    </div>
  </div>
);

const StudentInfo = ({ student }: { student: Student }) => (
  <div className="mb-2">
    <table className="table-header w-full text-[9pt]">
      <tbody>
        <tr>
          <td className="w-[18%]">Nama Santri</td>
          <td className="w-[2%]">:</td>
          <td className="w-[40%] font-bold uppercase">{student.name}</td>
          <td className="w-[15%]">Kelas</td>
          <td className="w-[2%]">:</td>
          <td className="w-[23%] font-bold">{student.class}</td>
        </tr>
        <tr>
          <td>Nomor Induk</td>
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

export default function App() {
  const [selectedClass, setSelectedClass] = useState<string | null>(localStorage.getItem('selected_class'));
  const [studentsList, setStudentsList] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Partial<Student> | null>(null);
  const [activeTab, setActiveTab] = useState<'identity' | 'grades'>('identity');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [logoUrl, setLogoUrl] = useState<string>(() => {
    return localStorage.getItem('al_hikmah_custom_logo') || '';
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setLogoUrl(base64);
        localStorage.setItem('al_hikmah_custom_logo', base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const classes = ['7', '8', '9', '10', '11', '12'];

  // Initialize data with seed data if empty
  useEffect(() => {
    const existingData = localStorage.getItem(STORAGE_KEY);
    if (!existingData) {
      const seedData: Student[] = [
        {
          id: '1',
          name: 'AHMAD ABDULLAH',
          nomorInduk: '2023001',
          noUrut: 1,
          class: '7',
          semester: 'GANJIL',
          tahunPelajaran: '2023/2024',
          subjects: [
            { name: "Asasul Mubtadiin Fi Ilmi Nahwi", category: "BAHASA ARAB", kkm: 70, tulis: { nilai: 85, huruf: 'B' }, lisan: { nilai: 80, huruf: 'B' } },
            { name: "Mutammimah", category: "BAHASA ARAB", kkm: 70, tulis: { nilai: 75, huruf: 'C' }, lisan: { nilai: 78, huruf: 'C' } },
            { name: "Asasul Mubtadiin Fi Ilmi Shorfi", category: "BAHASA ARAB", kkm: 70, tulis: { nilai: 90, huruf: 'A' }, lisan: { nilai: 88, huruf: 'B' } },
            { name: "Durusullughah", category: "BAHASA ARAB", kkm: 70, tulis: { nilai: 92, huruf: 'A' }, lisan: { nilai: 95, huruf: 'A' } },
            { name: "Qiraatul Kutub", category: "BAHASA ARAB", kkm: 70, tulis: { nilai: 82, huruf: 'B' }, lisan: { nilai: 84, huruf: 'B' } },
            { name: "Imla'", category: "BAHASA ARAB", kkm: 70, tulis: { nilai: 80, huruf: 'B' }, lisan: { nilai: 80, huruf: 'B' } },
            { name: "Al-Qur'an", category: "AGAMA", kkm: 70, tulis: { nilai: 95, huruf: 'A' }, lisan: { nilai: 98, huruf: 'A' } },
            { name: "Tajwid", category: "AGAMA", kkm: 70, tulis: { nilai: 88, huruf: 'B' }, lisan: { nilai: 85, huruf: 'B' } },
            { name: "Fiqih Ibadah", category: "AGAMA", kkm: 70, tulis: { nilai: 82, huruf: 'B' }, lisan: { nilai: 80, huruf: 'B' } },
            { name: "Fiqih Muamalah", category: "AGAMA", kkm: 70, tulis: { nilai: 78, huruf: 'C' }, lisan: { nilai: 75, huruf: 'C' } },
            { name: "Hafalan Hadits", category: "AGAMA", kkm: 70, tulis: { nilai: 90, huruf: 'A' }, lisan: { nilai: 92, huruf: 'A' } },
            { name: "Grammar", category: "BAHASA INGGRIS", kkm: 70, tulis: { nilai: 85, huruf: 'B' }, lisan: { nilai: 80, huruf: 'B' } },
            { name: "Stories For You", category: "BAHASA INGGRIS", kkm: 70, tulis: { nilai: 88, huruf: 'B' }, lisan: { nilai: 85, huruf: 'B' } },
            { name: "Dialogue/Speaking", category: "BAHASA INGGRIS", kkm: 70, tulis: { nilai: 90, huruf: 'A' }, lisan: { nilai: 95, huruf: 'A' } },
            { name: "Dictation", category: "BAHASA INGGRIS", kkm: 70, tulis: { nilai: 82, huruf: 'B' }, lisan: { nilai: 80, huruf: 'B' } },
            { name: "Vocabularies", category: "BAHASA INGGRIS", kkm: 70, tulis: { nilai: 85, huruf: 'B' }, lisan: { nilai: 88, huruf: 'B' } }
          ],
          behavior: { spiritual: 'Sangat baik dalam menjalankan ibadah harian.', social: 'Sangat sopan dan menghargai teman sebaya.' },
          attendance: { sakit: 1, izin: 0, alpha: 0 },
          extracurriculars: []
        }
      ];
      saveStoredStudents(seedData);
    }
  }, []);

  // Auto-save effect: Updates UI in real-time, sinks to server with debounce
  useEffect(() => {
    if (!editingStudent || !editingStudent.id) return;

    // REAL-TIME UI UPDATE: Update local list immediately as user types
    // This allows background rankings and reports to reflect changes instantly
    setStudentsList(prev => prev.map(s => s.id === editingStudent.id ? { ...s, ...editingStudent } as Student : s));

    const timer = setTimeout(() => {
      autoSaveStudent(editingStudent);
    }, 500); // 500ms debounce for faster server persistence

    return () => clearTimeout(timer);
  }, [editingStudent]);

  const handleCloseModal = async () => {
    if (editingStudent && editingStudent.id && saveStatus === 'saving') {
      // If still saving, wait or trigger immediate save
      await autoSaveStudent(editingStudent);
    }
    setIsModalOpen(false);
    setEditingStudent(null);
    setSaveStatus('idle');
  };

  const autoSaveStudent = async (student: Partial<Student>) => {
    if (!student.id) return;
    setSaveStatus('saving');
    try {
      const allStudents = getStoredStudents();
      const idx = allStudents.findIndex(s => s.id === student.id);
      if (idx !== -1) {
        allStudents[idx] = { ...allStudents[idx], ...student } as Student;
        saveStoredStudents(allStudents);
        setSaveStatus('saved');
      } else {
        setSaveStatus('error');
      }
    } catch (e) {
      setSaveStatus('error');
    }
  };

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
      const allStudents = getStoredStudents();
      const filtered = allStudents.filter(s => s.class === className);
      setStudentsList(filtered);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectClass = (className: string) => {
    setSelectedClass(className);
    localStorage.setItem('selected_class', className);
    setCurrentIndex(0);
  };

  const handleClearClass = () => {
    setSelectedClass(null);
    localStorage.removeItem('selected_class');
    setStudentsList([]);
  };

  const getHuruf = (nilai: number | string) => {
    if (typeof nilai !== 'number') return "-";
    if (nilai >= 90) return "A";
    if (nilai >= 80) return "B";
    if (nilai >= 70) return "C";
    return "D";
  };

  const filteredStudents = useMemo(() => {
    if (!searchTerm) return studentsList;
    return studentsList.filter(s => 
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.nomorInduk.includes(searchTerm)
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

  const stats = useMemo(() => {
    if (!selectedStudent) return { tulisTotal: 0, lisanTotal: 0, tulisAvg: "0", lisanAvg: "0" };
    const tulisTotal = selectedStudent.subjects.reduce((sum, sub) => sum + (typeof sub.tulis?.nilai === 'number' ? sub.tulis.nilai : 0), 0);
    const lisanTotal = selectedStudent.subjects.reduce((sum, sub) => sum + (typeof sub.lisan?.nilai === 'number' ? sub.lisan.nilai : 0), 0);
    const count = selectedStudent.subjects.length;
    return {
      tulisTotal,
      lisanTotal,
      tulisAvg: (tulisTotal / count).toFixed(2),
      lisanAvg: (lisanTotal / count).toFixed(2)
    };
  }, [selectedStudent]);

  const groupedSubjects = useMemo<Record<string, Subject[]>>(() => {
    if (!selectedStudent) return {};
    const groups: Record<string, Subject[]> = {};
    selectedStudent.subjects.forEach(s => {
      const cat = s.category || 'LAINNYA';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    });
    return groups;
  }, [selectedStudent]);

  const handleSaveStudent = async (e?: React.FormEvent, stayOpen: boolean = false) => {
    if (e) e.preventDefault();
    if (!editingStudent) return;

    const isEdit = !!editingStudent.id;

    const payload = isEdit ? editingStudent : {
      ...editingStudent,
      id: Date.now().toString(),
      noUrut: studentsList.length + 1
    } as Student;

    try {
      const allStudents = getStoredStudents();
      if (isEdit) {
        const idx = allStudents.findIndex(s => s.id === editingStudent.id);
        if (idx !== -1) {
          allStudents[idx] = payload as Student;
        }
      } else {
        allStudents.push(payload as Student);
      }
      saveStoredStudents(allStudents);

      if (!isEdit) {
        // If it's a new student, update local list instantly and select them
        const newStudent = payload as Student;
        setStudentsList(prev => [...prev, newStudent]);
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
      console.error(e);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus data santri ini?')) {
      try {
        const allStudents = getStoredStudents();
        const newList = allStudents.filter(s => s.id !== id);
        saveStoredStudents(newList);
        
        const filteredList = newList.filter(s => s.class === selectedClass);
        setStudentsList(filteredList);
        
        if (currentIndex >= filteredList.length && filteredList.length > 0) {
          setCurrentIndex(filteredList.length - 1);
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const openAddModal = () => {
    setActiveTab('identity');
    setEditingStudent({
      name: '',
      nomorInduk: '',
      class: selectedClass || '7',
      semester: 'GANJIL',
      tahunPelajaran: '2025/2026',
      subjects: [
        { name: "Asasul Mubtadiin Fi Ilmi Nahwi", category: "BAHASA ARAB", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Mutammimah", category: "BAHASA ARAB", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Asasul Mubtadiin Fi Ilmi Shorfi", category: "BAHASA ARAB", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Durusullughah", category: "BAHASA ARAB", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Qiraatul Kutub", category: "BAHASA ARAB", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Imla'", category: "BAHASA ARAB", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Al-Qur'an", category: "AGAMA", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Tajwid", category: "AGAMA", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Fiqih Ibadah", category: "AGAMA", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Fiqih Muamalah", category: "AGAMA", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Hafalan Hadits", category: "AGAMA", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Grammar", category: "BAHASA INGGRIS", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Stories For You", category: "BAHASA INGGRIS", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Dialogue/Speaking", category: "BAHASA INGGRIS", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Dictation", category: "BAHASA INGGRIS", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Vocabularies", category: "BAHASA INGGRIS", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } }
      ],
      behavior: { spiritual: '', social: '' },
      attendance: { sakit: 0, izin: 0, alpha: 0 },
      extracurriculars: []
    });
    setIsModalOpen(true);
  };

  const openEditModal = () => {
    setEditingStudent({ ...selectedStudent });
    setIsModalOpen(true);
  };

  const handlePrint = () => {
    if (!selectedStudent) return;
    const originalTitle = document.title;
    document.title = `Raport_${selectedStudent.name}`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 100);
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
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
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Controls */}
      <motion.aside 
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-72 bg-white border-r border-slate-200 overflow-y-auto no-print h-screen sticky top-0 shadow-sm flex flex-col pt-6 px-4"
      >
        <div className="flex items-center justify-between mb-8 px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-100 overflow-hidden p-1">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <Settings size={16} className="text-slate-300" />
              )}
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tingkat Kelas</p>
              <h2 className="text-sm font-bold text-slate-700 uppercase">KELAS {selectedClass}</h2>
            </div>
          </div>
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleClearClass} 
            className="text-slate-400 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-blue-50"
            title="Kembali ke Pilih Kelas"
          >
            <X size={18} />
          </motion.button>
        </div>

        <div className="space-y-6 flex-1">
          {/* Section: Students List */}
          <div>
            <h3 className="text-[10px] uppercase font-black text-slate-400 mb-3 ml-2 flex items-center gap-2">
              <User size={12} /> Data Santri
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
                      <span className="text-xs font-bold truncate max-w-[140px] uppercase">{s.name}</span>
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

        <div className="pb-6 pt-4 border-t border-slate-100">
          <button 
            onClick={handlePrint} 
            disabled={filteredStudents.length === 0}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl text-xs font-black flex items-center justify-center gap-3 transition-all shadow-xl shadow-blue-100 hover:translate-y-[-2px] active:translate-y-[0]"
          >
            <Printer size={18} /> CETAK RAPORT
          </button>
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
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

                  <div className="flex-1 overflow-y-auto p-8">
                    <form id="student-form" onSubmit={handleSaveStudent} className="space-y-10">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        {/* Column 1: Identity */}
                        <div className="space-y-6">
                          <h3 className="text-[10px] uppercase font-black text-blue-600 tracking-[0.2em] mb-4 flex items-center gap-2">
                            <UserCircle size={14} /> IDENTITAS DASAR
                          </h3>
                          <div className="space-y-4">
                            <div className="form-group">
                              <label className="text-xs font-bold text-slate-500 mb-1.5 block">Nama Lengkap</label>
                              <input required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-medium text-slate-700 uppercase" value={editingStudent.name} onChange={e => setEditingStudent({...editingStudent, name: e.target.value})} />
                            </div>
                            <div className="form-group">
                              <label className="text-xs font-bold text-slate-500 mb-1.5 block">Nomor Induk</label>
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

        {selectedStudent ? (
          <motion.div 
            key={selectedStudent.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-8 pb-20 flex flex-col items-center"
          >
             {/* Report Title */}
             <div className="w-[210mm] mb-6 flex items-center justify-between no-print">
               <div className="flex items-center gap-3">
                 <FileText className="text-blue-600" />
                 <div>
                   <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">{selectedStudent.name}</h2>
                   <p className="text-xs text-slate-400 font-medium">Raport Semester {selectedStudent.semester}</p>
                 </div>
               </div>
               <div className="text-xs font-bold text-slate-500 bg-white px-3 py-1.5 rounded-full border shadow-sm">
                 ID: {selectedStudent.nomorInduk}
               </div>
             </div>

             <div className="report-container shadow-2xl rounded-sm">
               {/* PAGE 1: COVER */}
               <section className="page flex flex-col items-center justify-center text-center">
                 {logoUrl ? (
                   <img src={logoUrl} alt="Logo Al-Hikmah" className="w-64 h-64 object-contain mb-16" referrerPolicy="no-referrer" />
                 ) : (
                   <div className="w-64 h-64 border-4 border-dashed border-slate-200 rounded-3xl flex items-center justify-center mb-16 mx-auto">
                     <span className="text-slate-300 font-extrabold text-2xl uppercase tracking-widest text-center px-4">LOGO PESANTREN</span>
                   </div>
                 )}
                 <h1 className="text-4xl font-extrabold uppercase mb-4 tracking-tighter text-slate-900">Laporan Hasil Belajar</h1>
                 <h2 className="text-2xl font-bold uppercase mb-20 text-slate-600">Pondok Pesantren Modern Al-Hikmah</h2>
                 
                 <div className="border-[6px] border-black p-12 w-full max-w-lg mx-auto bg-white">
                   <table className="w-full text-xl text-left table-fixed border-collapse">
                     <tbody>
                       <tr className="border-b-2 border-slate-100">
                         <td className="py-4 w-1/3">Nama</td>
                         <td className="w-4 text-center">:</td>
                         <td className="font-bold py-4 uppercase pl-2">{selectedStudent.name}</td>
                       </tr>
                       <tr className="border-b-2 border-slate-100">
                         <td className="py-4">Nomor Induk</td>
                         <td className="text-center">:</td>
                         <td className="font-bold py-4 pl-2">{selectedStudent.nomorInduk}</td>
                       </tr>
                       <tr>
                         <td className="py-4">Kelas</td>
                         <td className="text-center">:</td>
                         <td className="font-bold py-4 pl-2">{selectedStudent.class}</td>
                       </tr>
                     </tbody>
                   </table>
                 </div>

                 <div className="absolute bottom-24 w-full text-center">
                   <p className="font-bold uppercase leading-relaxed text-xl tracking-widest text-slate-800">SEMESTER {selectedStudent.semester}</p>
                   <p className="font-bold uppercase leading-relaxed text-xl tracking-widest text-slate-800">TAHUN PELAJARAN {selectedStudent.tahunPelajaran}</p>
                 </div>
               </section>

               {/* PAGE 2-5 same content but with selectedStudent */}
               <section className="page">
                 <Header logoUrl={logoUrl} />
                 <StudentInfo student={selectedStudent} />
                 <h3 className="font-bold mb-3 uppercase text-lg border-b-2 border-black inline-block mt-4">A. NILAI TULIS & LISAN</h3>
                 <table className="table-raport w-full text-center mt-2">
                   <thead>
                     <tr>
                       <th rowSpan={2} className="w-[5%]">No</th>
                       <th rowSpan={2} className="w-[35%]">Mata Pelajaran</th>
                       <th rowSpan={2} className="w-[8%]">KKM</th>
                       <th colSpan={2} className="w-[26%]">Nilai Tulis</th>
                       <th colSpan={2} className="w-[26%]">Nilai Lisan</th>
                     </tr>
                     <tr>
                       <th className="w-[13%] text-xs italic">SKOR</th>
                       <th className="w-[13%] text-xs italic">HURUF</th>
                       <th className="w-[13%] text-xs italic">SKOR</th>
                       <th className="w-[13%] text-xs italic">HURUF</th>
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
                                   const newSubs = [...(selectedStudent.subjects || [])];
                                   const subIdx = newSubs.findIndex(s => s.name === sub.name);
                                   if (subIdx !== -1) {
                                     newSubs[subIdx] = { ...newSubs[subIdx], tulis: { nilai: val, huruf: getHuruf(val) } };
                                     const updated = {...selectedStudent, subjects: newSubs};
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
                                   const newSubs = [...(selectedStudent.subjects || [])];
                                   const subIdx = newSubs.findIndex(s => s.name === sub.name);
                                   if (subIdx !== -1) {
                                     newSubs[subIdx] = { ...newSubs[subIdx], lisan: { nilai: val, huruf: getHuruf(val) } };
                                     const updated = {...selectedStudent, subjects: newSubs};
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

                 <div className="signature-section mt-16 text-[10.5pt] flex justify-between items-start px-4">
                   <div className="signature-box flex flex-col items-center flex-1">
                     <p>Mengetahui,</p>
                     <p>Orang Tua/Wali Santri</p>
                     <div className="h-28"></div>
                     <div className="signature-line w-48 border-black"></div>
                   </div>
                   <div className="signature-box flex flex-col items-center flex-1 text-center">
                     <p>Tangerang, 20 Desember 2025</p>
                     <p>Wali Kelas,</p>
                     <div className="h-28 uppercase font-bold text-[8pt] pt-10 opacity-30 tracking-[0.2em]">Stempel Resmi</div>
                     <p className="font-bold border-b-2 border-black inline-block min-w-[140px] text-lg">....................................</p>
                   </div>
                 </div>
               </section>

               {/* SIKAP */}
               <section className="page border-t-2 mt-8 print:border-none print:mt-0">
                 <Header logoUrl={logoUrl} />
                 <StudentInfo student={selectedStudent} />
                 <h3 className="font-bold mb-3 uppercase text-lg border-b-2 border-black inline-block">B. SIKAP</h3>
                 <table className="table-raport mb-12 text-[10pt]">
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
                            value={selectedStudent.behavior.spiritual || ''}
                            onChange={e => {
                                const updated = {...selectedStudent, behavior: {...selectedStudent.behavior, spiritual: e.target.value}};
                                setStudentsList(prev => prev.map(s => s.id === updated.id ? updated : s));
                                autoSaveStudent(updated);
                            }}
                          />
                          <div className="hidden print:block whitespace-pre-wrap">{selectedStudent.behavior.spiritual || '-'}</div>
                        </td>
                     </tr>
                     <tr>
                       <td className="font-bold text-center py-8">Sikap Sosial</td>
                                               <td className="relative px-6 py-6 bg-slate-50/30">
                          <textarea 
                            className="w-full min-h-[100px] bg-transparent outline-none resize-none no-print focus:bg-blue-50/50 p-2 rounded-xl transition-all leading-relaxed"
                            placeholder="Tulis deskripsi sikap sosial..."
                            value={selectedStudent.behavior.social || ''}
                            onChange={e => {
                                const updated = {...selectedStudent, behavior: {...selectedStudent.behavior, social: e.target.value}};
                                setStudentsList(prev => prev.map(s => s.id === updated.id ? updated : s));
                                autoSaveStudent(updated);
                            }}
                          />
                          <div className="hidden print:block whitespace-pre-wrap">{selectedStudent.behavior.social || '-'}</div>
                        </td>
                     </tr>
                   </tbody>
                 </table>
               </section>

               {/* EKSTRAKURIKULER & ABSENSI */}
               <section className="page border-t-2 mt-8 print:border-none print:mt-0">
                 <Header logoUrl={logoUrl} />
                 <StudentInfo student={selectedStudent} />
                 
                 <h3 className="font-bold mb-3 uppercase text-lg border-b-2 border-black inline-block">E. EKSTRAKURIKULER</h3>
                 <table className="table-raport mb-12 text-[10pt]">
                   <thead>
                     <tr className="bg-slate-50 h-10">
                       <th className="w-[40%] text-center">KEGIATAN / PROGRAM</th>
                       <th className="w-[60%] text-center">KETERANGAN PERKEMBANGAN</th>
                     </tr>
                   </thead>
                   <tbody>
                     {selectedStudent.extracurriculars.length > 0 ? selectedStudent.extracurriculars.map((ex, idx) => (
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
                 <table className="table-raport mb-12 text-[10pt] w-[300px]">
                   <thead>
                     <tr className="bg-slate-50 h-10">
                       <th className="w-[60%]">KETERANGAN</th>
                       <th className="w-[40%]">JUMLAH (HARI)</th>
                     </tr>
                   </thead>
                   <tbody>
                                           <tr><td className="pl-4">Sakit</td><td className="p-0"><input type="number" className="w-full text-center py-2 bg-transparent font-bold no-print focus:bg-blue-50/50 outline-none" value={selectedStudent.attendance.sakit} onChange={e => { const updated = {...selectedStudent, attendance: {...selectedStudent.attendance, sakit: parseInt(e.target.value) || 0}}; setStudentsList(prev => prev.map(s => s.id === updated.id ? updated : s)); autoSaveStudent(updated); }} /><span className="hidden print:inline">{selectedStudent.attendance.sakit}</span></td></tr>
                                           <tr><td className="pl-4">Izin</td><td className="p-0"><input type="number" className="w-full text-center py-2 bg-transparent font-bold no-print focus:bg-blue-50/50 outline-none" value={selectedStudent.attendance.izin} onChange={e => { const updated = {...selectedStudent, attendance: {...selectedStudent.attendance, izin: parseInt(e.target.value) || 0}}; setStudentsList(prev => prev.map(s => s.id === updated.id ? updated : s)); autoSaveStudent(updated); }} /><span className="hidden print:inline">{selectedStudent.attendance.izin}</span></td></tr>
                                           <tr><td className="pl-4">Tanpa Keterangan</td><td className="p-0"><input type="number" className="w-full text-center py-2 bg-transparent font-bold no-print focus:bg-blue-50/50 outline-none" value={selectedStudent.attendance.alpha} onChange={e => { const updated = {...selectedStudent, attendance: {...selectedStudent.attendance, alpha: parseInt(e.target.value) || 0}}; setStudentsList(prev => prev.map(s => s.id === updated.id ? updated : s)); autoSaveStudent(updated); }} /><span className="hidden print:inline">{selectedStudent.attendance.alpha}</span></td></tr>
                   </tbody>
                 </table>

                 <div className="mt-12 bg-slate-50 p-8 border-2 border-black">
                   <h3 className="font-bold mb-4 text-center uppercase tracking-widest underline underline-offset-4">Keputusan Akhir</h3>
                   <div className="flex flex-col items-center">
                     <p className="text-center text-slate-700 italic mb-6 leading-relaxed">Berdasarkan hasil pencapaian kompetensi dan kedisiplinan santri selama proses pembelajaran, maka diputuskan:</p>
                     <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="font-black text-center text-3xl tracking-[0.15em] bg-white border-[3px] border-black px-12 py-6 uppercase inline-block"
                      >
                       {selectedStudent.semester === 'GENAP' ? (
                         selectedStudent.class === '9' || selectedStudent.class === '12' 
                           ? 'LULUS / TIDAK LULUS' 
                           : 'NAIK KELAS / TIDAK NAIK KELAS'
                       ) : null}
                     </motion.div>
                   </div>
                 </div>
               </section>

               {/* LEDGER */}
               <section className="page border-t-2 mt-8 print:border-none print:mt-0">
                 <Header logoUrl={logoUrl} />
                 <div className="text-center mb-10 mt-6">
                   <h1 className="text-2xl font-black uppercase tracking-widest text-slate-800">Ledger Perkembangan Nilai Santri</h1>
                   <h2 className="text-lg font-bold uppercase text-slate-500 mt-1">Kelas {selectedStudent.class} • TA {selectedStudent.tahunPelajaran}</h2>
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
                     {studentRankings.map((s) => (
                       <tr key={s.id} className={s.id === selectedStudent.id ? 'bg-blue-50/50 font-bold border-x-4 border-blue-600' : 'hover:bg-slate-50/50 transition-colors'}>
                         <td className="text-center font-medium font-mono">{s.rank}</td>
                         <td className="pl-6 uppercase">{s.name}</td>
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
                 <div className="mt-8 p-4 bg-blue-50/50 rounded-xl border border-blue-100 no-print">
                   <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest text-center">Ledger ini bersifat internal untuk wali kelas</p>
                 </div>
               </section>
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
                 className="mt-10 bg-blue-600 text-white px-10 py-4 rounded-2xl font-black text-sm tracking-widest shadow-xl shadow-blue-200"
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
