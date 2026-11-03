import Contacts from "@/components/booking/Contacts";
import Shell from "@/components/booking/Shell";
import { listContacts } from "@/booking/repo";
import { isAdminSession, pageUser } from "@/booking/session";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const user = await pageUser("/booking/contacts");
  const [contacts, admin] = await Promise.all([listContacts(user.id), isAdminSession(user)]);
  return (
    <Shell title="Mes contacts" tab="contacts" adminAs={admin ? user.pseudo : null} backHref="/booking">
      <Contacts initial={contacts} />
    </Shell>
  );
}
