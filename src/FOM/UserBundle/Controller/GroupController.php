<?php

namespace FOM\UserBundle\Controller;

use Doctrine\ORM\EntityManagerInterface;
use FOM\UserBundle\Entity\Group;
use FOM\UserBundle\Security\Permission\ResourceDomainInstallation;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use FOM\ManagerBundle\Configuration\Route;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Acl\Dbal\MutableAclProvider;
use Symfony\Component\Security\Acl\Domain\RoleSecurityIdentity;
use Symfony\Component\Security\Acl\Domain\UserSecurityIdentity;
use Symfony\Component\Security\Acl\Model\MutableAclProviderInterface;
use Symfony\Component\Security\Acl\Permission\MaskBuilder;
use Symfony\Component\Security\Acl\Domain\ObjectIdentity;

/**
 * Group management controller
 *
 * @author Christian Wygoda
 */
class GroupController extends AbstractController
{
    public function __construct(
        protected MutableAclProviderInterface $aclProvider,
        protected EntityManagerInterface $em,
    )
    {
    }

    /**
     * @Route("/group/new", methods={"GET", "POST"})
     *
     * There is one weirdness when storing groups: In Doctrine Many-to-Many
     * associations, updates are only written, when the owning side changes.
     * For the User-Group association, the user is the owner part.
     * @param Request $request
     * @return Response
     * @throws \Exception
     */
    public function createAction(Request $request)
    {
        $group = new Group();

        $this->denyAccessUnlessGranted(ResourceDomainInstallation::ACTION_CREATE_GROUPS);

        $form = $this->createForm('FOM\UserBundle\Form\Type\GroupType', $group);
        $form->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            $this->em->persist($group);

            // See method documentation for Doctrine weirdness
            foreach($group->getUsers() as $user) {
                $user->addGroup($group);
            }

            $this->em->flush();

            $objectIdentity = ObjectIdentity::fromDomainObject($group);
            $acl = $this->aclProvider->createAcl($objectIdentity);

            // retrieving the security identity of the currently logged-in user
            $securityIdentity = UserSecurityIdentity::fromAccount($this->getUser());

            $acl->insertObjectAce($securityIdentity, MaskBuilder::MASK_OWNER);
            $this->aclProvider->updateAcl($acl);

            $this->addFlash('success', 'The group has been saved.');

            return $this->redirectToRoute('fom_user_security_index', array(
                '_fragment' => 'tabGroups',
            ));
        }

        return $this->render('@FOMUser/Group/form.html.twig', array(
            'group' => $group,
            'form' => $form->createView(),
            'title' => 'fom.user.group.form.new_group',
        ));
    }

    /**
     * @Route("/group/{id}/edit", methods={"GET", "POST"})
     * @param Request $request
     * @param string $id
     * @return Response
     */
    public function editAction(Request $request, $id)
    {
        $this->denyAccessUnlessGranted(ResourceDomainInstallation::ACTION_EDIT_GROUPS);

        /** @var Group|null $group */
        $group = $this->em->getRepository(Group::class)->find($id);
        if (!$group) {
            throw new NotFoundHttpException('The group does not exist');
        }

        $form = $this->createForm('FOM\UserBundle\Form\Type\GroupType', $group);

        // see https://afilina.com/doctrine-not-saving-manytomany
        foreach ($group->getUsers() as $previousUser) {
            $previousUser->getGroups()->removeElement($group);
            $this->em->persist($previousUser);
        }
        $form->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            foreach ($group->getUsers() as $currentUser) {
                $this->em->persist($currentUser);
                $currentUser->getGroups()->add($group);
            }
            $this->em->flush();

            $this->addFlash('success', 'The group has been updated.');
            return $this->redirectToRoute('fom_user_security_index', array(
                '_fragment' => 'tabGroups',
            ));
        }

        return $this->render('@FOMUser/Group/form.html.twig', array(
            'group' => $group,
            'form' => $form->createView(),
            'title' => 'fom.user.group.form.edit_group',
        ));
    }

    /**
     * @Route("/group/{id}/delete", methods={"POST"})
     * @param string $id
     * @return Response
     */
    public function deleteAction(Request  $request, $id)
    {
        /** @var Group|null $group */
        $group = $this->em->getRepository(Group::class)->find($id);

        if($group === null) {
            throw new NotFoundHttpException('The group does not exist');
        }
        // ACL access check
        $this->denyAccessUnlessGranted(ResourceDomainInstallation::ACTION_DELETE_GROUPS);

        if (!$this->isCsrfTokenValid('group_delete', $request->request->get('token'))) {
            $this->addFlash('error', 'Invalid CSRF token.');
            return new Response();
        }


        $this->em->beginTransaction();

        try {
            if (($this->aclProvider) instanceof MutableAclProvider) {
                $sid = new RoleSecurityIdentity($group->getRole());
                $this->aclProvider->deleteSecurityIdentity($sid);
            }

            $this->em->remove($group);

            $oid = ObjectIdentity::fromDomainObject($group);
            $this->aclProvider->deleteAcl($oid);

            $this->em->flush();
            $this->em->commit();
        } catch(\Exception $e) {
            $this->em->rollback();
            $this->addFlash('error', "The group couldn't be deleted.");
        }
        return new Response();
    }
}
