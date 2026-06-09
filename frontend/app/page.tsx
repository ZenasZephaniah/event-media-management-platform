"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { 
  UploadCloud, Download, Heart, Sparkles, UserCheck, Search, Trash2, 
  LogIn, LogOut, Share2, FolderPlus, X, Plus, Calendar, Bell, Users, CheckCircle, AlertTriangle
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
const GUEST_USER = { id: "guest", name: "Guest Viewer", role: "VIEWER", email: "" };

// Helper function to process raw images to Base64 buffers
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(",")[1];
      resolve(base64String);
    };
    reader.onerror = error => reject(error);
  });
};

export default function Home() {
  const [user, setUser] = useState<any>(GUEST_USER);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "", role: "CLUB_MEMBER" });

  const [gallery, setGallery] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  
  const [activeTab, setActiveTab] = useState<"gallery" | "events" | "upload" | "profile">("gallery");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "name" | "category">("date");
  const [eventSortMode, setEventSortMode] = useState<"created" | "happening">("happening");
  const [galleryFeedFilter, setGalleryFeedFilter] = useState<"all" | "matches">("all");
  
  // CUSTOM NOTIFICATION TOAST & DIALOG MODAL STATE
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  // ERROR CONTROLLERS
  const [apiError, setApiError] = useState<string | null>(null);

  // UPLOAD STAGING
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; preview: string; privacy: "PUBLIC" | "PRIVATE" }[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState("");
  const [uploadProgress, setUploadProgress] = useState("");

  // REFERENCE SELFIE REGISTRATION
  const [registeringSelfie, setRegisteringSelfie] = useState(false);

  // EVENT INITIALIZER
  const [newEvent, setNewEvent] = useState({ name: "", desc: "", cat: "Campus Culture", club: "", date: "" });
  const [newAlbumName, setNewAlbumName] = useState<{ [eventId: string]: string }>({});

  // SOCIAL ENGAGEMENT
  const [commentInputs, setCommentInputs] = useState<{ [mediaId: string]: string }>({});

  // Trigger Slide-In Toast Alert
  const showNotification = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Inject Inter Typography dynamically
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    document.body.style.fontFamily = "'Inter', sans-serif";
  }, []);

  // Validate active session against backend to recover from database wipes
  useEffect(() => {
    const verifyDatabaseSession = async () => {
      const savedUser = localStorage.getItem("cig_user");
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          if (parsed.id === "guest") return;

          const res = await fetch(`${API_URL}/api/users?t=${Date.now()}`, { cache: "no-store" });
          if (res.ok) {
            const dbUsers = await res.json();
            const sessionStillValid = dbUsers.some((u: any) => u.id === parsed.id);
            
            if (!sessionStillValid) {
              localStorage.removeItem("cig_user");
              setUser(GUEST_USER);
              showNotification("A database reset has been detected. Session cleared.", "info");
            } else {
              setUser(parsed);
            }
          }
        } catch (e) {
          localStorage.removeItem("cig_user");
        }
      }
    };
    verifyDatabaseSession();
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [user]);

  const fetchInitialData = async () => {
    fetchGallery();
    fetchEvents();
    fetchUsers();
    if (user.id !== "guest") {
      fetchNotifications();
    } else {
      setNotifications([]);
    }
  };

  const fetchGallery = async () => {
    try {
      setApiError(null);
      const res = await fetch(`${API_URL}/api/media?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setGallery(data);
      } else {
        setApiError("The API Server returned an internal error. Please check backend logs.");
      }
    } catch (e: any) {
      setApiError("Cannot connect to backend server. Make sure your server is running on port 5001.");
    }
  };

  const fetchEvents = async () => {
    try {
      const res = await fetch(`${API_URL}/api/events?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
        if (data.length > 0 && data[0].albums.length > 0) {
          setSelectedAlbumId(data[0].albums[0].id);
        }
      }
    } catch (e: any) {
      console.warn("Failed to fetch events from port 5001");
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/users?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) setUsersList(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${API_URL}/api/notifications/${user.id}?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) setNotifications(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  // --- AUTH OPERATIONS ---
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const endpoint = isRegistering ? "register" : "login";
    try {
      const res = await fetch(`${API_URL}/api/auth/${endpoint}`, {
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify(authForm)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      localStorage.setItem("cig_user", JSON.stringify(data.user));
      setUser(data.user);
      setShowAuthModal(false);
      setAuthForm({ name: "", email: "", password: "", role: "CLUB_MEMBER" });
      showNotification(`Logged in successfully as ${data.user.name}!`);
    } catch (err: any) { 
      showNotification(err.message || "Authentication attempt rejected.", "error"); 
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("cig_user");
    setUser(GUEST_USER);
    setActiveTab("gallery");
    showNotification("Logged out successfully.", "info");
  };

  // --- SOCIAL PROFILE SWITCHER ---
  const handleSimulationSwitch = (targetUser: any) => {
    const sessionObj = {
      id: targetUser.id,
      name: targetUser.name,
      role: targetUser.role || "CLUB_MEMBER",
      email: targetUser.email,
      referenceSelfie: targetUser.referenceSelfie,
      awsFaceId: targetUser.awsFaceId
    };
    localStorage.setItem("cig_user", JSON.stringify(sessionObj));
    setUser(sessionObj);
    showNotification(`Active profile context switched to: ${targetUser.name}`, "info");
  };

  // --- UPLOAD PROCESSOR ---
  const onDropMedia = useCallback(async (acceptedFiles: File[]) => {
    if (user.id === "guest") {
      showNotification("Please register or log in with an account to upload media.", "error");
      return;
    }

    const imageFiles = acceptedFiles.filter(
      file => file.type === "image/jpeg" || file.type === "image/png"
    );

    if (imageFiles.length !== acceptedFiles.length) {
      showNotification("Only standard JPEG and PNG formats are accepted.", "error");
    }

    if (imageFiles.length === 0) return;

    const filesWithStablePreviews = await Promise.all(
      imageFiles.map(async (file) => {
        return new Promise<{ file: File; preview: string; privacy: "PUBLIC" | "PRIVATE" }>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              file,
              preview: reader.result as string, 
              privacy: "PUBLIC" as "PUBLIC" | "PRIVATE"
            });
          };
          reader.readAsDataURL(file);
        });
      })
    );

    setPendingFiles(prev => [...prev, ...filesWithStablePreviews]);
  }, [user]);

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const executeBulkUpload = async () => {
    if (!selectedAlbumId) return showNotification("Please select a target Event Album!", "error");
    setUploading(true);
    try {
      for (let i = 0; i < pendingFiles.length; i++) {
        const asset = pendingFiles[i];
        setUploadProgress(`Ingesting file ${i + 1} of ${pendingFiles.length}...`);

        const base64Data = await fileToBase64(asset.file);

        const res = await fetch(`${API_URL}/api/media/upload-direct`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: asset.file.name,
            fileType: asset.file.type,
            base64Data,
            albumId: selectedAlbumId,
            uploaderId: user.id,
            privacy: asset.privacy
          })
        });

        const responseData = await res.json();
        if (!res.ok) {
          throw new Error(responseData.error || "Server upload failure");
        }
      }
      showNotification("Batch upload completed successfully!");
      setPendingFiles([]);
      fetchGallery(); 
      setTimeout(() => setUploadProgress(""), 3000);
    } catch (e: any) { 
      showNotification(`Upload failure: ${e.message}`, "error"); 
    } finally { 
      setUploading(false); 
    }
  };

  // --- HANDLERS FOR SELFIE REGISTRATION (Face Matching Flow) ---
  const handleSelfieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      return showNotification("Selfie must be JPEG or PNG format.", "error");
    }

    setRegisteringSelfie(true);
    try {
      const base64Data = await fileToBase64(file);
      const res = await fetch(`${API_URL}/api/user/register-selfie`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          filename: file.name,
          fileType: file.type,
          base64Data
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to register selfie");

      const updatedSessionUser = { ...user, referenceSelfie: data.user.referenceSelfie, awsFaceId: data.user.awsFaceId };
      localStorage.setItem("cig_user", JSON.stringify(updatedSessionUser));
      setUser(updatedSessionUser);
      showNotification("AI Facial reference registered successfully!");
    } catch (err: any) {
      showNotification(`Registration failed: ${err.message}`, "error");
    } finally {
      setRegisteringSelfie(false);
    }
  };

  // Safe Face Index Deletion / Reset Flow
  const handleDeleteSelfie = async () => {
    setConfirmModal({
      title: "Reset AI Face Reference?",
      message: "This will remove your current registered face index and reference selfie S3 files. You will need to upload a new one to enable matches.",
      onConfirm: async () => {
        try {
          const res = await fetch(`${API_URL}/api/user/delete-selfie`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id })
          });
          const data = await res.json();
          if (res.ok) {
            const updatedSessionUser = { ...user, referenceSelfie: null, awsFaceId: null };
            localStorage.setItem("cig_user", JSON.stringify(updatedSessionUser));
            setUser(updatedSessionUser);
            showNotification("AI Face reference removed successfully.");
          } else {
            showNotification(data.error || "Failed to reset selfie.", "error");
          }
        } catch (e) {
          showNotification("Failed to connect to authentication server.", "error");
        }
        setConfirmModal(null);
      }
    });
  };

  // --- EVENTS & MANAGEMENT HUB ---
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user.id === "guest") {
      return showNotification("Authentication required to deploy events.", "error");
    }
    try {
      const res = await fetch(`${API_URL}/api/events`, {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: newEvent.name,
          date: newEvent.date,
          category: newEvent.cat,
          creatorId: user.id,
          clubName: newEvent.club,
          description: newEvent.desc
        })
      });
      const data = await res.json();
      if (res.ok) {
        setNewEvent({ name: "", desc: "", cat: "Campus Culture", club: "", date: "" });
        fetchEvents();
        showNotification("System Event deployed successfully!");
      } else {
        showNotification(`Failed to create event: ${data.error || "Unknown error"}`, "error");
      }
    } catch (err) {
      console.error(err);
      showNotification("Failed to communicate with event server.", "error");
    }
  };

  // Safe Cascade Delete Confirmation Modal Trigger
  const triggerDeleteEvent = (id: string) => {
    setConfirmModal({
      title: "Permanently Delete Event?",
      message: "This will destroy this event, all associated albums, S3 files, and gallery photos. This cannot be undone.",
      onConfirm: async () => {
        try {
          await fetch(`${API_URL}/api/events/${id}`, { method: "DELETE" });
          fetchEvents();
          fetchGallery();
          showNotification("Event and nested contents deleted successfully.");
        } catch (e) {
          showNotification("Failed to clear event.", "error");
        }
        setConfirmModal(null);
      }
    });
  };

  // Optimistic UI delete pipeline (Smooth UI updates)
  const executeOptimisticMediaDelete = async (mediaId: string) => {
    setConfirmModal({
      title: "Delete Gallery Photo?",
      message: "Do you want to permanently delete this photo? This will remove all likes and comments.",
      onConfirm: async () => {
        setGallery(prev => prev.filter(m => m.id !== mediaId));
        showNotification("Media removal processed.");

        try {
          const res = await fetch(`${API_URL}/api/media/${mediaId}`, { method: "DELETE" });
          if (!res.ok) {
            fetchGallery(); 
            showNotification("Delete operation rejected by database.", "error");
          }
        } catch (e) {
          fetchGallery();
        }
        setConfirmModal(null);
      }
    });
  };

  const handleCreateAlbum = async (eventId: string) => {
    const name = newAlbumName[eventId];
    if (!name) return;
    try {
      await fetch(`${API_URL}/api/albums`, {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, eventId })
      });
      setNewAlbumName(prev => ({ ...prev, [eventId]: "" }));
      fetchEvents();
      showNotification("Custom album added.");
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteAlbum = async (albumId: string) => {
    setConfirmModal({
      title: "Delete Album?",
      message: "This will destroy the album and delete all photos inside it. Proceed?",
      onConfirm: async () => {
        try {
          await fetch(`${API_URL}/api/albums/${albumId}`, { method: "DELETE" });
          fetchEvents();
          fetchGallery();
          showNotification("Album cleared.");
        } catch (e) {
          showNotification("Failed to delete album.", "error");
        }
        setConfirmModal(null);
      }
    });
  };

  // --- SOCIAL ENGAGEMENTS ---
  const handleCommentInput = (mediaId: string, val: string) => {
    setCommentInputs(prev => ({ ...prev, [mediaId]: val }));
  };

  const submitComment = async (mediaId: string) => {
    const commentText = commentInputs[mediaId];
    if (!commentText) return;
    try {
      const res = await fetch(`${API_URL}/api/media/${mediaId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, text: commentText })
      });
      if (res.ok) {
        setCommentInputs(prev => ({ ...prev, [mediaId]: "" }));
        fetchGallery();
        showNotification("Comment published.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLike = async (mediaId: string) => {
    if (user.id === "guest") {
      showNotification("Authentication required to interact.", "info");
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/media/${mediaId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id })
      });
      if (res.ok) {
        fetchGallery();
        fetchNotifications();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleShare = (streamUrl: string) => {
    navigator.clipboard.writeText(streamUrl)
      .then(() => showNotification("Media stream link copied to clipboard!"))
      .catch(() => showNotification("Copy action restricted by browser security.", "error"));
  };

  const handleTagFriend = async (mediaId: string, targetUserId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/media/${mediaId}/tag-user`, {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, actorUserId: user.id })
      });
      if (res.ok) {
        showNotification("Friend tagged successfully!");
        fetchGallery();
      } else {
        showNotification("Failed to tag friend.", "error");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const markNotificationRead = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/notifications/${id}/read`, { method: "POST" });
      fetchNotifications();
    } catch (e) {
      console.error(e);
    }
  };

  const { getRootProps: getMediaProps, getInputProps: getMediaInputProps } = useDropzone({ 
    onDrop: onDropMedia,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png']
    }
  });

  // --- FILTERING & SEARCH ---
  const filteredGallery = gallery.filter((media) => {
    const isGuest = user.id === "guest";
    const isViewer = user.role === "VIEWER";
    if (media.privacy === "PRIVATE" && (isGuest || isViewer)) {
      return false; 
    }

    if (galleryFeedFilter === "matches" && !media.facesInPhoto?.includes(user.id)) {
      return false;
    }
    
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    
    const tagMatch = media.tags?.some((t: string) => t.toLowerCase().includes(q));
    const uploaderMatch = media.uploader?.name?.toLowerCase().includes(q);
    const eventMatch = media.album?.event?.name?.toLowerCase().includes(q);
    const albumMatch = media.album?.name?.toLowerCase().includes(q);
    const dateMatch = new Date(media.createdAt).toLocaleDateString().includes(q);
    
    return tagMatch || uploaderMatch || eventMatch || albumMatch || dateMatch;
  }).sort((a, b) => {
    if (sortBy === "name") {
      const nameA = a.album?.event?.name || "";
      const nameB = b.album?.event?.name || "";
      return nameA.localeCompare(nameB);
    }
    if (sortBy === "category") {
      const catA = a.album?.event?.category || "";
      const catB = b.album?.event?.category || "";
      return catA.localeCompare(catB);
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const sortedEvents = [...events].sort((a, b) => {
    if (eventSortMode === "created") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const unreadNotificationsCount = notifications.filter(n => !n.isRead).length;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 pb-20 antialiased selection:bg-indigo-500 selection:text-white">
      
      {/* GLOBAL FLOATING ACTION TOAST ALERT */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center bg-slate-900 text-white text-xs font-bold px-5 py-3.5 rounded-2xl shadow-xl space-x-2.5 animate-slideDown max-w-sm border border-slate-800">
          {toast.type === "success" && <CheckCircle className="w-4 h-4 text-emerald-400" />}
          {toast.type === "error" && <AlertTriangle className="w-4 h-4 text-rose-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* CUSTOM DECISION CONFIRMATION MODAL OVERLAY */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-scaleUp">
            <h3 className="text-base font-bold text-slate-900 mb-2">{confirmModal.title}</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-6 font-semibold">{confirmModal.message}</p>
            <div className="flex space-x-3 justify-end">
              <button 
                onClick={() => setConfirmModal(null)} 
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition"
              >
                Cancel
              </button>
              <button 
                onClick={confirmModal.onConfirm} 
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NAVBAR */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-slate-200/80 shadow-sm px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab("gallery")}>
            <div className="bg-gradient-to-tr from-indigo-600 to-violet-500 p-2.5 rounded-2xl text-white shadow-md shadow-indigo-100 transition-all hover:scale-105">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl font-black text-slate-900 tracking-tight bg-gradient-to-r from-slate-950 to-slate-700 bg-clip-text text-transparent">CIG EMMP</span>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-0.5">Campus Vault System</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <nav className="flex space-x-1">
              <button 
                onClick={() => setActiveTab("gallery")} 
                className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wide uppercase transition-all duration-200 ${activeTab === "gallery" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/50"}`}
              >
                Gallery Feed
              </button>
              <button 
                onClick={() => setActiveTab("events")} 
                className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wide uppercase transition-all duration-200 ${activeTab === "events" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/50"}`}
              >
                Event Studio
              </button>
              {user.id !== "guest" && (
                <>
                  <button 
                    onClick={() => setActiveTab("upload")} 
                    className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wide uppercase transition-all duration-200 ${activeTab === "upload" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/50"}`}
                  >
                    Upload Desk
                  </button>
                  <button 
                    onClick={() => setActiveTab("profile")} 
                    className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wide uppercase transition-all duration-200 relative ${activeTab === "profile" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/50"}`}
                  >
                    Profile
                    {unreadNotificationsCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center animate-pulse border-2 border-white">
                        {unreadNotificationsCount}
                      </span>
                    )}
                  </button>
                </>
              )}
            </nav>
            
            {user.id === "guest" ? (
              <button 
                onClick={() => {
                  setIsRegistering(false);
                  setShowAuthModal(true);
                }} 
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition duration-200 flex items-center space-x-1.5 shadow-md shadow-indigo-100 hover:shadow-indigo-200"
              >
                <LogIn className="w-4 h-4" />
                <span>Login</span>
              </button>
            ) : (
              <div className="flex items-center space-x-3 border-l pl-4 border-slate-200">
                <div className="text-right">
                  <p className="text-xs font-semibold text-slate-900 leading-none">{user.name}</p>
                  <p className="text-[9px] text-indigo-600 font-extrabold uppercase tracking-widest mt-1">{user.role}</p>
                </div>
                <button 
                  onClick={handleLogout} 
                  className="p-1.5 text-slate-400 hover:text-rose-500 rounded-xl transition duration-200"
                  title="Logout Session"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* WORKSPACE */}
      <div className="max-w-7xl mx-auto px-6 mt-10">

        {/* Dynamic Non-Crashing API Connection Warning */}
        {apiError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-5 py-4 rounded-3xl mb-8 shadow-sm flex items-center justify-between animate-fadeIn">
            <div>
              <span className="font-extrabold block">System Offline Warning:</span>
              <span className="font-semibold">{apiError}</span>
            </div>
            <button 
              onClick={fetchInitialData} 
              className="bg-white border border-red-200 hover:bg-red-50 text-red-700 font-bold px-4 py-2 rounded-xl transition shadow-xs text-[10px]"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* --- TAB 1: GALLERY FEED --- */}
        {activeTab === "gallery" && (
          <div className="space-y-8 animate-fadeIn">
            {/* Search Console */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200/80 flex flex-col md:flex-row gap-4 items-center">
              <div className="relative flex-grow w-full">
                <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search events, albums, tags (e.g. #nature), uploader..." 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)} 
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-transparent focus:border-slate-200 focus:bg-white rounded-2xl outline-none text-sm transition-all duration-200" 
                />
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <select 
                  value={sortBy} 
                  onChange={e => setSortBy(e.target.value as any)} 
                  className="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-600 focus:outline-none w-full md:w-auto cursor-pointer"
                >
                  <option value="date">Recent Uploads</option>
                  <option value="name">Event Name</option>
                  <option value="category">Category</option>
                </select>
              </div>
            </div>

            {/* AI Match Filters */}
            {user.id !== "guest" && user.awsFaceId && (
              <div className="flex border-b border-slate-200 pb-1 space-x-6 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <button 
                  onClick={() => setGalleryFeedFilter("all")} 
                  className={`pb-3 border-b-2 transition ${galleryFeedFilter === "all" ? "border-indigo-600 text-indigo-600" : "border-transparent hover:text-slate-700"}`}
                >
                  All Gallery Photos
                </button>
                <button 
                  onClick={() => setGalleryFeedFilter("matches")} 
                  className={`pb-3 border-b-2 transition flex items-center space-x-1 ${galleryFeedFilter === "matches" ? "border-indigo-600 text-indigo-600" : "border-transparent hover:text-slate-700"}`}
                >
                  <UserCheck className="w-4 h-4 mr-1" />
                  <span>AI Matches (Photos of Me)</span>
                </button>
              </div>
            )}

            {/* Gallery Layout */}
            {filteredGallery.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border border-slate-200">
                <p className="text-slate-400 font-medium">No results match your criteria.</p>
                <p className="text-[10px] text-slate-400 italic mt-2">Check your browser console (F12) to view system diagnostics logs.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredGallery.map(media => (
                  <div key={media.id} className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-200/80 flex flex-col hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                    <div className="h-64 w-full relative bg-slate-100 overflow-hidden">
                      <img src={`${API_URL}/api/media/stream?key=${media.s3Key}`} alt="" className="w-full h-full object-cover" loading="lazy" />
                      
                      <span className="absolute top-3 left-3 bg-slate-900/95 backdrop-blur-sm text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
                        {media.privacy}
                      </span>
                      
                      {media.facesInPhoto?.includes(user.id) && (
                        <span className="absolute top-3 right-3 bg-emerald-500 text-white text-[9px] font-black px-2.5 py-1 rounded-full flex items-center shadow-sm">
                          <UserCheck className="w-3.5 h-3.5 mr-1" /> RECOGNIZED BY AI
                        </span>
                      )}
                      
                      {(user.role === "ADMIN" || media.uploaderId === user.id) && (
                        <button 
                          onClick={() => executeOptimisticMediaDelete(media.id)}
                          className="absolute bottom-3 right-3 w-8 h-8 bg-rose-500 hover:bg-rose-600 text-white p-2 rounded-full cursor-pointer transition shadow-lg flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    
                    {/* Media Body */}
                    <div className="p-5 flex-grow flex flex-col justify-between">
                      <div>
                        <h4 className="font-bold text-slate-900 leading-snug">{media.album?.event?.name || 'General'}</h4>
                        <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest mt-1">
                          Album: {media.album?.name || 'Media'}
                        </p>
                        <p className="text-[10px] text-slate-400 font-semibold mt-1">
                          Uploaded by {media.uploader?.name || 'System'} | {new Date(media.createdAt).toLocaleDateString()}
                        </p>
                        
                        {/* Auto-Tags */}
                        <div className="flex flex-wrap gap-1 mt-3">
                          {media.tags?.map((tag: string, index: number) => (
                            <span key={index} className="bg-slate-100 text-slate-600 text-[9px] font-semibold px-2 py-0.5 rounded uppercase">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Tag Friend Mechanism */}
                      {user.id !== "guest" && (
                        <div className="mt-4 border-t pt-3 border-slate-100 flex items-center space-x-2">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Tag User:</span>
                          <select 
                            onChange={(e) => {
                              if (e.target.value) {
                                handleTagFriend(media.id, e.target.value);
                                e.target.value = "";
                              }
                            }}
                            className="text-[10px] bg-slate-50 border border-slate-200 rounded-lg p-1 flex-grow outline-none text-slate-600 font-semibold cursor-pointer"
                          >
                            <option value="">Select account...</option>
                            {usersList.map(u => (
                              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Comments Section */}
                    <div className="bg-slate-50/50 border-t border-slate-100 p-4 space-y-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Comments</p>
                      {media.comments && media.comments.length > 0 ? (
                        <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                          {media.comments.map((comment: any) => (
                            <div key={comment.id} className="text-xs bg-slate-100 p-2 rounded-xl">
                              <span className="font-bold text-slate-700 mr-1.5">{comment.user?.name}:</span>
                              <span className="text-slate-600 font-medium">{comment.text}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 font-medium italic">No comments yet</p>
                      )}

                      {user.id !== "guest" && (
                        <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100/50">
                          <input 
                            placeholder="Add a comment..." 
                            value={commentInputs[media.id] || ""}
                            onChange={e => handleCommentInput(media.id, e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") submitComment(media.id); }}
                            className="bg-white border border-slate-200 text-xs px-2.5 py-1.5 rounded-lg flex-grow outline-none focus:border-indigo-500"
                          />
                          <button 
                            onClick={() => submitComment(media.id)}
                            className="bg-indigo-600 text-white text-xs px-3 rounded-lg font-bold hover:bg-indigo-700"
                          >
                            Send
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Footer Operations */}
                    <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 flex justify-between items-center">
                      <div className="flex items-center space-x-3.5">
                        <button 
                          onClick={() => handleLike(media.id)}
                          className="flex items-center text-slate-400 hover:text-rose-500 transition animate-like"
                        >
                          <Heart 
                            className={`w-5 h-5 mr-1 ${
                              media.interactions?.some((i: any) => i.userId === user.id && i.type === "LIKE")
                                ? 'fill-rose-500 text-rose-500'
                                : 'text-slate-400'
                            }`} 
                          />
                          <span className="text-xs font-bold text-slate-500">{media.interactions?.length || 0}</span>
                        </button>
                        
                        <button 
                          onClick={() => handleShare(`${API_URL}/api/media/stream?key=${media.s3Key}`)}
                          className="text-slate-400 hover:text-indigo-500 transition"
                          title="Copy Stream URL"
                        >
                          <Share2 className="w-5 h-5" />
                        </button>
                      </div>
                      
                      {user.id !== "guest" ? (
                        <a 
                          href={`${API_URL}/api/media/download/${media.id}?userId=${user.id}`} 
                          className="bg-slate-950 hover:bg-slate-800 text-white text-[11px] font-bold px-4 py-2 rounded-xl flex items-center transition shadow-sm"
                        >
                          <Download className="w-3.5 h-3.5 mr-1" /> Download
                        </a>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400">Join to download</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- TAB 2: EVENT STUDIO --- */}
        {activeTab === "events" && (
          <div className="space-y-8 animate-fadeIn">
            {/* Event Ingest Form */}
            {(user.role === "ADMIN" || user.role === "PHOTOGRAPHER") ? (
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm mb-8 animate-fadeIn">
                <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center">
                  <Plus className="w-5 h-5 mr-1.5 text-indigo-600" /> Deploy New Event Card
                </h3>
                <form onSubmit={handleCreateEvent} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Event Name</label>
                    <input 
                      required 
                      value={newEvent.name} 
                      onChange={e => setNewEvent({ ...newEvent, name: e.target.value })} 
                      className="w-full border rounded-xl px-3 py-2 mt-1.5 text-sm outline-none focus:border-indigo-500" 
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Host Club Name</label>
                    <input 
                      required 
                      value={newEvent.club} 
                      onChange={e => setNewEvent({ ...newEvent, club: e.target.value })} 
                      className="w-full border rounded-xl px-3 py-2 mt-1.5 text-sm outline-none focus:border-indigo-500" 
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Happening Date</label>
                    <input 
                      type="date" 
                      required 
                      value={newEvent.date} 
                      onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} 
                      className="w-full border rounded-xl px-3 py-2 mt-1.5 text-sm outline-none focus:border-indigo-500" 
                    />
                  </div>
                  <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-sm transition shadow-md shadow-indigo-100">
                    Create Event
                  </button>
                </form>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 text-xs font-semibold text-amber-700">
                Notice: Log in with an Administrator or Photographer role profile to deploy events.
              </div>
            )}

            {/* Event Header Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-950 tracking-tight">Active Events Studio</h2>
                <p className="text-xs text-slate-400">Sort, query, and structure albums belonging to campus events.</p>
              </div>
              <div className="flex space-x-2">
                <button 
                  onClick={() => setEventSortMode("happening")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${eventSortMode === "happening" ? "bg-indigo-600 text-white shadow-sm" : "bg-white border text-slate-500 hover:bg-slate-50"}`}
                >
                  By Event Date
                </button>
                <button 
                  onClick={() => setEventSortMode("created")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${eventSortMode === "created" ? "bg-indigo-600 text-white shadow-sm" : "bg-white border text-slate-500 hover:bg-slate-50"}`}
                >
                  By Date Created
                </button>
              </div>
            </div>

            {/* Events Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {sortedEvents.map(ev => (
                <div key={ev.id} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-col justify-between hover:shadow-md transition duration-200">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="bg-indigo-50 text-indigo-600 text-[9px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider">
                          {ev.category || "Campus Culture"}
                        </span>
                        <h3 className="text-lg font-bold text-slate-900 leading-snug mt-2">{ev.name}</h3>
                        <p className="text-xs text-slate-400 font-semibold flex items-center mt-1">
                          <Calendar className="w-3.5 h-3.5 mr-1" /> {ev.clubName} • {new Date(ev.date).toLocaleDateString()}
                        </p>
                      </div>
                      {(user.role === "ADMIN" || user.id === ev.creatorId) && (
                        <button 
                          onClick={() => triggerDeleteEvent(ev.id)} 
                          className="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg transition"
                          title="Delete Event"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                    
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">Event Albums</h4>
                      <ul className="space-y-2 mb-4">
                        {ev.albums?.map((alb: any) => (
                          <li key={alb.id} className="flex justify-between items-center text-xs font-semibold bg-white p-2.5 rounded-xl border border-slate-200 text-slate-700">
                            <span className="flex items-center">
                              <FolderPlus className="w-4 h-4 mr-2 text-indigo-500" /> {alb.name}
                            </span>
                            {(user.role === "ADMIN" || user.id === ev.creatorId) && ev.albums.length > 1 && (
                              <button 
                                onClick={() => handleDeleteAlbum(alb.id)}
                                className="text-slate-300 hover:text-rose-500 transition"
                                title="Delete Album"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                      
                      {(user.role === "ADMIN" || user.role === "PHOTOGRAPHER") && (
                        <div className="flex gap-2 border-t pt-3 border-slate-200/50 mt-2">
                          <input 
                            placeholder="Add new album name..." 
                            value={newAlbumName[ev.id] || ""} 
                            onChange={e => setNewAlbumName({ ...newAlbumName, [ev.id]: e.target.value })} 
                            className="border border-slate-200 rounded-xl px-3 py-1.5 flex-grow text-xs outline-none focus:border-slate-300 bg-white" 
                          />
                          <button 
                            onClick={() => handleCreateAlbum(ev.id)} 
                            className="bg-slate-850 hover:bg-slate-700 text-white text-xs font-bold px-4 rounded-xl transition"
                          >
                            Create
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- TAB 3: UPLOAD DESK --- */}
        {activeTab === "upload" && (
          <div className="max-w-4xl mx-auto bg-white rounded-3xl p-8 shadow-sm border border-slate-200/80 animate-fadeIn">
            <h3 className="text-xl font-bold mb-2 text-slate-900">Media Ingest Portal</h3>
            <p className="text-xs text-slate-400 mb-6">Select an event album. Images will render previews immediately before final storage confirmation.</p>
            
            <select 
              value={selectedAlbumId} 
              onChange={e => setSelectedAlbumId(e.target.value)} 
              className="w-full bg-slate-50 border border-slate-200 font-bold text-slate-600 rounded-xl px-4 py-3.5 mb-8 outline-none focus:border-indigo-500 text-sm cursor-pointer"
            >
              <option value="">-- Select Destination Album --</option>
              {events.map(ev => ev.albums?.map((alb: any) => (
                <option key={alb.id} value={alb.id}>{ev.name} ➔ {alb.name}</option>
              )))}
            </select>

            <div 
              {...getMediaProps()} 
              className="border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50 rounded-2xl p-12 text-center cursor-pointer mb-8 transition-all duration-200"
            >
              <input {...getMediaInputProps()} />
              <UploadCloud className="w-12 h-12 text-indigo-500 mx-auto mb-3 animate-bounce" />
              <p className="font-bold text-slate-700">Drag and drop raw images here</p>
              <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-widest">Enforcing strictly JPG and PNG photos</p>
            </div>

            {/* Uploading File Previews Grid */}
            {pendingFiles.length > 0 && (
              <div className="mb-8">
                <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-3">Upload Queue</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {pendingFiles.map((item, idx) => (
                    <div key={idx} className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 flex flex-col justify-end h-40 shadow-sm group">
                      <img src={item.preview} alt="" className="h-full w-full object-cover absolute inset-0" />
                      <button 
                        onClick={() => removePendingFile(idx)} 
                        className="absolute top-2 right-2 bg-slate-900/80 hover:bg-slate-900 text-white rounded-full p-1.5 shadow transition"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      
                      <select 
                        value={item.privacy} 
                        onChange={e => {
                          const arr = [...pendingFiles]; 
                          arr[idx].privacy = e.target.value as any; 
                          setPendingFiles(arr);
                        }} 
                        className="relative z-10 w-full bg-slate-950/90 text-white text-[10px] font-bold p-2 border-0 outline-none cursor-pointer"
                      >
                        <option value="PUBLIC">PUBLIC</option>
                        <option value="PRIVATE">PRIVATE</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {uploadProgress && (
              <div className="text-center bg-indigo-50 border border-indigo-100 text-indigo-600 font-bold p-3 rounded-xl mb-4 text-xs">
                {uploadProgress}
              </div>
            )}
            
            {pendingFiles.length > 0 && (
              <button 
                onClick={executeBulkUpload} 
                disabled={uploading} 
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold py-4 rounded-xl text-sm transition shadow-md shadow-indigo-100"
              >
                {uploading ? "Ingesting queue..." : "Execute Upload Queue"}
              </button>
            )}
          </div>
        )}

        {/* --- TAB 4: PROFILE & SOCIAL SWITCHER --- */}
        {activeTab === "profile" && (
          <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
            
            {/* User Profile Card */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900">{user.name}</h3>
                <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider mt-0.5">{user.role} Profile Account</p>
                <p className="text-xs text-slate-400 font-semibold mt-1">Email: {user.email || "Offline Testing Account"}</p>
              </div>
              
              {/* FACE REGISTRATION CONTAINER */}
              {user.id !== "guest" && (
                <div className="flex items-center space-x-3 bg-slate-50 border border-slate-200/80 p-3 rounded-2xl">
                  {user.referenceSelfie ? (
                    <div className="flex items-center space-x-3">
                      <img src={user.referenceSelfie} alt="Selfie" className="w-10 h-10 rounded-full object-cover border border-slate-300 shadow-xs" />
                      <div>
                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block leading-none">Registered</span>
                        <button 
                          onClick={handleDeleteSelfie}
                          className="text-[9px] text-red-500 hover:text-red-700 font-bold mt-1 block hover:underline"
                        >
                          Reset Face Reference
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block leading-none mb-1">Face Recognition</span>
                      <label className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg cursor-pointer transition inline-block">
                        {registeringSelfie ? "Indexing Face..." : "Register Selfie"}
                        <input type="file" accept="image/png, image/jpeg" onChange={handleSelfieUpload} className="hidden" disabled={registeringSelfie} />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notification Center */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm">
              <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center">
                <Bell className="w-5 h-5 mr-1.5 text-indigo-600 animate-swing" /> Notifications Tray
              </h3>
              {notifications.length === 0 ? (
                <p className="text-xs text-slate-400 font-medium italic">Your notification history is empty.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {notifications.map(n => (
                    <div 
                      key={n.id} 
                      onClick={() => !n.isRead && markNotificationRead(n.id)}
                      className={`text-xs p-3.5 rounded-2xl border flex justify-between items-center cursor-pointer transition-all duration-200 ${
                        n.isRead ? 'bg-slate-50 text-slate-500 border-slate-100' : 'bg-indigo-50/50 text-slate-800 border-indigo-100/50 hover:bg-indigo-50'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-slate-900 mr-1.5">{n.actor}:</span>
                        <span>{n.action}</span>
                        <p className="text-[9px] text-slate-400 font-semibold mt-0.5">{new Date(n.createdAt).toLocaleTimeString()}</p>
                      </div>
                      {!n.isRead && (
                        <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Simulator Profile Switcher */}
            <div className="bg-indigo-950 text-white rounded-3xl p-6 shadow-md border border-indigo-900">
              <h3 className="text-base font-bold mb-1 flex items-center">
                <Users className="w-5 h-5 mr-2" /> Local Interaction Sandbox
              </h3>
              <p className="text-xs text-indigo-200/80 mb-5">Switch between simulated accounts locally to test likes, tagging, and notifications.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {usersList.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleSimulationSwitch(u)}
                    className={`p-3.5 rounded-2xl text-left border transition-all duration-200 text-xs font-bold flex flex-col justify-between ${
                      user.id === u.id 
                        ? 'bg-white text-indigo-900 border-white shadow-md' 
                        : 'bg-indigo-900/40 border-indigo-800/80 text-white hover:bg-indigo-900/80'
                    }`}
                  >
                    <span>{u.name}</span>
                    <span className="text-[9px] uppercase tracking-wider opacity-60 font-black mt-2">{u.role || "CLUB_MEMBER"}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* AUTHENTICATION MODAL */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 relative shadow-xl border border-slate-100">
            <button 
              onClick={() => {
                setShowAuthModal(false);
                setIsRegistering(false);
              }} 
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h2 className="text-xl font-bold mb-2 text-center text-slate-800">
              {isRegistering ? "Register Profile" : "Access Vault Portal"}
            </h2>
            <p className="text-[10px] text-amber-600 font-semibold bg-amber-50 rounded-xl p-2.5 mb-4 text-center">
              Notice: If the database was recently wiped, previous accounts do not exist. Please click "Register Profile" below to create a new profile.
            </p>
            
            <form onSubmit={handleAuth} className="space-y-4">
              {isRegistering && (
                <input 
                  placeholder="Full Name" 
                  required 
                  value={authForm.name}
                  onChange={e => setAuthForm({ ...authForm, name: e.target.value })} 
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500" 
                />
              )}
              <input 
                type="email" 
                placeholder="Campus Email" 
                required 
                value={authForm.email}
                onChange={e => setAuthForm({ ...authForm, email: e.target.value })} 
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500" 
              />
              <input 
                type="password" 
                placeholder="Password" 
                required 
                value={authForm.password}
                onChange={e => setAuthForm({ ...authForm, password: e.target.value })} 
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500" 
              />
              {isRegistering && (
                <select 
                  value={authForm.role}
                  onChange={e => setAuthForm({ ...authForm, role: e.target.value })} 
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-600 text-xs outline-none cursor-pointer"
                >
                  <option value="VIEWER">Viewer (Public Only)</option>
                  <option value="CLUB_MEMBER">Club Member (Full Access)</option>
                  <option value="PHOTOGRAPHER">Photographer</option>
                  <option value="ADMIN">Administrator</option>
                </select>
              )}
              <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-3.5 rounded-xl text-sm transition shadow-md shadow-indigo-100">
                {isRegistering ? "Submit Registration" : "Enter Portal"}
              </button>
            </form>
            
            <p 
              className="text-center mt-6 text-xs text-indigo-600 font-bold cursor-pointer hover:underline" 
              onClick={() => setIsRegistering(!isRegistering)}
            >
              {isRegistering ? "Already registered? Login here" : "Need registration? Sign up here"}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}