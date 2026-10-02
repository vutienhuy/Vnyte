import CheckIcon from '@heroicons/react/24/outline/CheckIcon';
import ChevronDownIcon from '@heroicons/react/24/outline/ChevronDownIcon';
import UserIcon from '@heroicons/react/24/solid/UserIcon';
import { useState, useRef, useEffect } from 'react';
import type { Patient } from "@/types/registration";
import UsersIcon from '@heroicons/react/24/outline/UsersIcon';


interface MemberDropdownProps {
    members: Patient[];
    selectedMember: Patient | null;
    onSelect: (member: Patient) => void;
    loading?: boolean;
}

export default function MemberDropdown({
    members,
    selectedMember,
    onSelect,
    loading = false
}: MemberDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (loading) {
        return (
            <div className="w-full">
                <label className="block text-xl font-semibold text-gray-700 mb-2">
                    Chọn thành viên
                </label>
                <div className="w-full p-4 bg-gray-100 rounded-xl animate-pulse">
                    <div className="h-6 bg-gray-200 rounded w-48"></div>
                </div>
            </div>
        );
    }

    const getDisplayName = (member: Patient) => {
        return member.fullName || `${member.lastName} ${member.firstName}`;
    };

    const handleSelect = (member: Patient) => {
        onSelect(member);
        setIsOpen(false);
    };

    return (
        <div className="w-full" ref={dropdownRef}>
            <label className="block text-xl font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <UsersIcon className="w-6 h-6 text-blue-900" />
                <span>Chọn thành viên</span>
            </label>

            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full px-3 py-2.5 bg-slate border border-slate-200 rounded-lg hover:border-blue-900 focus:border-blue-900 focus:outline-none transition-colors duration-200 flex items-center justify-between group cursor-pointer"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                            <UserIcon className="w-6 h-6 text-blue-900" />
                        </div>
                        <div className="text-left">
                            <div className="text-lg font-medium text-slate-800">
                                {selectedMember ? getDisplayName(selectedMember) : 'Chọn thành viên'}
                            </div>
                            {selectedMember?.isOwner && (
                                <div className="text-md text-blue-900 font-medium">Chủ tài khoản</div>
                            )}
                        </div>
                    </div>
                    <ChevronDownIcon
                        className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    />
                </button>

                {isOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                        <div className="max-h-60 overflow-y-auto">
                            {members.map((member, index) => {
                                const isSelected = selectedMember?.idNumber === member.idNumber;
                                return (
                                    <button
                                        key={member.idNumber || index}
                                        type="button"
                                        onClick={() => handleSelect(member)}
                                        className={`w-full px-3 py-2.5 flex items-center gap-3 transition-colors duration-200 cursor-pointer ${isSelected
                                            ? 'bg-blue-50'
                                            : 'hover:bg-slate-50'
                                            }`}
                                    >
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isSelected ? 'bg-blue-100 ring-2 ring-blue-900' : 'bg-slate-100'}`}>
                                            <UserIcon className={`w-6 h-6 ${isSelected ? 'text-blue-900' : 'text-slate-400'}`} />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <div className={`text-lg font-medium ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                                                {getDisplayName(member)}
                                            </div>
                                            {member.isOwner && (
                                                <div className="text-md text-blue-900 font-medium">
                                                    Chủ tài khoản
                                                </div>
                                            )}
                                        </div>
                                        {isSelected && (
                                            <div className="w-5 h-5 rounded-full bg-blue-900 flex items-center justify-center flex-shrink-0">
                                                <CheckIcon className="w-3 h-3 text-white" />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}