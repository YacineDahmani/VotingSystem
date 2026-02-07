import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin } from '@/contexts/AdminContext';
import { useAdminLogin } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/contexts/ToastContext';
import { Lock } from 'lucide-react';

export default function AdminLogin() {
    const [password, setPassword] = useState('');
    const { login } = useAdmin();
    const loginMutation = useAdminLogin();
    const navigate = useNavigate();
    const { addToast } = useToast();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await loginMutation.mutateAsync(password);
            login();
            addToast('Welcome back, Admin', 'success');
            navigate('/admin');
        } catch (error) {
            addToast('Invalid credentials', 'error');
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 bg-sky-500/10 rounded-full flex items-center justify-center text-sky-500 mb-4">
                        <Lock size={24} />
                    </div>
                    <CardTitle className="text-2xl">Admin Access</CardTitle>
                    <p className="text-slate-400 text-sm">Enter your secure password to continue</p>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="text-center tracking-widest"
                            autoFocus
                        />
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={loginMutation.isPending}
                        >
                            {loginMutation.isPending ? 'Verifying...' : 'Unlock Dashboard'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
