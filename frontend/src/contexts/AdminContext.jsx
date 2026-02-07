import { createContext, useContext, useState } from 'react';

const AdminContext = createContext(null);

export const AdminProvider = ({ children }) => {
    const [isAdmin, setIsAdmin] = useState(false);

    const login = () => setIsAdmin(true);
    const logout = () => setIsAdmin(false);

    // In a real app, we'd verify a token or session on mount

    return (
        <AdminContext.Provider value={{ isAdmin, login, logout }}>
            {children}
        </AdminContext.Provider>
    );
};

export const useAdmin = () => {
    const context = useContext(AdminContext);
    if (!context) throw new Error('useAdmin must be used within an AdminProvider');
    return context;
};
