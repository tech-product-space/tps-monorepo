import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import CertificateEmail from './CertificateEmail/CertificateEmail';
import EditorContainer from './EditorContainer';

const CertificateTemplate = () => {
    const pathname = usePathname();
    const [eventId, setEventId] = React.useState<string | null>(null);

    useEffect(() => {
        if (pathname) {
            const parts = pathname.split("/");
            const id = parts[parts.length - 1];
            setEventId(id);
        }
    }, [pathname]);


    return (
        <div className='flex flex-col gap-12 pb-10'>
            <EditorContainer eventId={eventId}/>
            <CertificateEmail eventId={eventId} /> 
        </div>
    );
}

export default CertificateTemplate;
